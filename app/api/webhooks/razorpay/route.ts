import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@/lib/db";
import { getRazorpayWebhookSecret, verifyRazorpayWebhookSignature } from "@/lib/razorpay";
import { InvoicePaymentError, settleInvoicePayment } from "@/lib/payments/settle-invoice-payment";
import { emitEvent } from "@/lib/events/bus";
import type { AppEvent } from "@/lib/events/types";

export const runtime = "nodejs";

type RazorpayWebhookBody = {
  id: string;
  entity: string;
  event: string;
  payload: {
    payment_link?: { entity: Record<string, unknown> };
    payment?: { entity: Record<string, unknown> };
  };
  created_at: number;
};

async function recordPaymentEvent(
  invoiceId: number,
  eventType: string,
  razorpayEventId: string,
  amount: number,
  currency: string,
  paymentId?: string,
  paymentLinkId?: string,
  payload?: Record<string, unknown>,
) {
  return prisma.paymentEvent.upsert({
    where: { razorpayEventId },
    update: {
      status: "PROCESSED",
      processedAt: new Date(),
    },
    create: {
      invoiceId,
      source: "razorpay",
      eventType,
      razorpayEventId,
      paymentId: paymentId || null,
      paymentLinkId: paymentLinkId || null,
      amount: amount / 100, // Convert paise to rupees
      currency: currency.toUpperCase(),
      status: "PROCESSED",
      payload: payload ? JSON.parse(JSON.stringify(payload)) : undefined,
      processedAt: new Date(),
    },
  });
}

async function recordRazorpayPayment(invoiceId: number, paymentData: Record<string, unknown>) {
  const amount = (paymentData.amount as number) || 0;
  const paymentId = typeof paymentData.id === "string" ? paymentData.id : "";
  const currency = (paymentData.currency as string) || "INR";
  const amountPaidRupees = amount / 100;
  if (!paymentId || !Number.isFinite(amountPaidRupees) || amountPaidRupees <= 0) {
    return { status: "ignored" as const, reason: "Missing provider payment ID or amount" };
  }

  try {
    return await settleInvoicePayment({
      invoiceId,
      amount: amountPaidRupees,
      method: `Razorpay (${currency})`,
      date: new Date(),
      note: "Razorpay payment via webhook",
      transactionId: paymentId,
      razorpayPaymentId: paymentId,
    });
  } catch (error) {
    if (error instanceof InvoicePaymentError && error.code === "ALREADY_PAID") {
      return { status: "ignored" as const, reason: error.message };
    }
    throw error;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// GET handler for Razorpay callback_method: "get" redirects
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const paymentId = url.searchParams.get("razorpay_payment_id");
  const paymentLinkId = url.searchParams.get("razorpay_payment_link_id");
  const referenceId = url.searchParams.get("razorpay_payment_link_reference_id");
  const status = url.searchParams.get("razorpay_payment_link_status");

  if (status !== "paid" || !paymentLinkId || !referenceId) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  const invoiceId = parseInt(referenceId, 10);
  if (isNaN(invoiceId)) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, balance: true, status: true },
    });

    if (!invoice || invoice.status === "Paid") {
      return NextResponse.redirect(new URL(`/invoice/${invoiceId}`, req.url));
    }

    if (paymentId) {
      await settleInvoicePayment({
        invoiceId,
        amount: Number(invoice.balance),
        method: "Razorpay (INR)",
        date: new Date(),
        note: "Razorpay payment via callback redirect",
        transactionId: paymentId,
        razorpayPaymentId: paymentId,
      });
    }

    // Update payment link on invoice
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        razorpayPaymentLinkId: paymentLinkId,
        razorpayPaymentLinkUrl: url.origin + url.pathname + url.search,
      },
    });
  } catch (error) {
    console.error("GET webhook handler failed:", error);
  }

  return NextResponse.redirect(new URL(`/invoice/${invoiceId}?paid=true`, req.url));
}

export async function POST(req: NextRequest) {
  const webhookSecret = getRazorpayWebhookSecret();

  if (!webhookSecret) {
    console.error("RAZORPAY_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 },
    );
  }

  let webhookEventId: number | null = null;

  try {
    const rawBody = await req.text();
    const signature = (await headers()).get("x-razorpay-signature");

    if (!verifyRazorpayWebhookSignature(rawBody, signature, webhookSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const event = JSON.parse(rawBody) as RazorpayWebhookBody;
    const razorpayEventId = event.id;

    // Claim the provider event before processing. Failed events are retried
    // safely because the underlying payment settlement is atomic and keyed by
    // the provider payment ID.
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: { eventId: razorpayEventId },
      select: { id: true, status: true },
    });

    if (existingEvent) {
      if (existingEvent.status === "PROCESSED") {
        return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
      }
      const claimed = await prisma.webhookEvent.updateMany({
        where: { id: existingEvent.id, status: { in: ["RECEIVED", "FAILED"] } },
        data: { status: "PROCESSING", error: null },
      });
      if (claimed.count === 0) {
        return NextResponse.json({ received: true, inProgress: true }, { status: 200 });
      }
      webhookEventId = existingEvent.id;
    } else {
      try {
        const webhookEvent = await prisma.webhookEvent.create({
          data: {
            eventId: razorpayEventId,
            eventType: event.event,
            payload: event as unknown as object,
            source: "razorpay",
            status: "PROCESSING",
          },
        });
        webhookEventId = webhookEvent.id;
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
      }
    }

    switch (event.event) {
      // ── Payment Link Events ──────────────────────────────────────────────
      case "payment_link.paid": {
        const paymentLink = event.payload.payment_link?.entity;
        if (!paymentLink) break;

        const paymentLinkId = paymentLink.id as string;
        const referenceId = paymentLink.reference_id as string | null;
        const invoiceId = referenceId ? parseInt(referenceId, 10) : NaN;

        if (!invoiceId || isNaN(invoiceId)) break;

        // Record payment event
        await recordPaymentEvent(
          invoiceId,
          "payment_link.paid",
          razorpayEventId,
          (paymentLink.amount_paid as number) || (paymentLink.amount as number) || 0,
          (paymentLink.currency as string) || "INR",
          undefined,
          paymentLinkId,
          paymentLink,
        );

        // Find the payment ID from the payment_link if available
        const payment = event.payload.payment?.entity;
        const paymentId = payment?.id as string | undefined;

        if (paymentId) {
          await recordRazorpayPayment(invoiceId, payment as Record<string, unknown>);
        }
        break;
      }

      case "payment_link.partially_paid": {
        const paymentLink = event.payload.payment_link?.entity;
        if (!paymentLink) break;

        const paymentLinkId = paymentLink.id as string;
        const referenceId = paymentLink.reference_id as string | null;
        const invoiceId = referenceId ? parseInt(referenceId, 10) : NaN;

        if (!invoiceId || isNaN(invoiceId)) break;

        await recordPaymentEvent(
          invoiceId,
          "payment_link.partially_paid",
          razorpayEventId,
          (paymentLink.amount_paid as number) || 0,
          (paymentLink.currency as string) || "INR",
          undefined,
          paymentLinkId,
          paymentLink,
        );

        const payment = event.payload.payment?.entity;
        if (payment?.id) {
          await recordRazorpayPayment(invoiceId, payment as Record<string, unknown>);
        }
        break;
      }

      case "payment_link.expired": {
        const paymentLink = event.payload.payment_link?.entity;
        if (!paymentLink) break;

        const paymentLinkId = paymentLink.id as string;
        const referenceId = paymentLink.reference_id as string | null;
        const invoiceId = referenceId ? parseInt(referenceId, 10) : NaN;

        if (!invoiceId || isNaN(invoiceId)) break;

        await recordPaymentEvent(
          invoiceId,
          "payment_link.expired",
          razorpayEventId,
          0,
          (paymentLink.currency as string) || "INR",
          undefined,
          paymentLinkId,
          paymentLink,
        );

        // Clear the payment link from invoice
        await prisma.invoice.update({
          where: { id: invoiceId },
          data: {
            razorpayPaymentLinkId: null,
            razorpayPaymentLinkUrl: null,
          },
        });
        break;
      }

      case "payment_link.cancelled": {
        const paymentLink = event.payload.payment_link?.entity;
        if (!paymentLink) break;

        const paymentLinkId = paymentLink.id as string;
        const referenceId = paymentLink.reference_id as string | null;
        const invoiceId = referenceId ? parseInt(referenceId, 10) : NaN;

        if (!invoiceId || isNaN(invoiceId)) break;

        await recordPaymentEvent(
          invoiceId,
          "payment_link.cancelled",
          razorpayEventId,
          0,
          (paymentLink.currency as string) || "INR",
          undefined,
          paymentLinkId,
          paymentLink,
        );

        await prisma.invoice.update({
          where: { id: invoiceId },
          data: {
            razorpayPaymentLinkId: null,
            razorpayPaymentLinkUrl: null,
          },
        });
        break;
      }

      // ── Payment Events ───────────────────────────────────────────────────
      case "payment.captured": {
        const payment = event.payload.payment?.entity;
        if (!payment) break;

        const paymentId = payment.id as string;
        const paymentLinkId = payment.payment_link_id as string | null;

        // Find invoice from payment link reference or metadata
        let invoiceId: number | null = null;

        if (paymentLinkId) {
          const paymentLinkInvoice = await prisma.invoice.findFirst({
            where: { razorpayPaymentLinkId: paymentLinkId },
            select: { id: true },
          });
          invoiceId = paymentLinkInvoice?.id || null;
        }

        if (!invoiceId) break;

        await recordPaymentEvent(
          invoiceId,
          "payment.captured",
          razorpayEventId,
          (payment.amount as number) || 0,
          (payment.currency as string) || "INR",
          paymentId,
          paymentLinkId || undefined,
          payment as unknown as Record<string, unknown>,
        );

        await recordRazorpayPayment(invoiceId, payment as Record<string, unknown>);
        break;
      }

      case "payment.failed": {
        const payment = event.payload.payment?.entity;
        if (!payment) break;

        const paymentId = payment.id as string;
        const paymentLinkId = payment.payment_link_id as string | null;

        let invoiceId: number | null = null;
        if (paymentLinkId) {
          const paymentLinkInvoice = await prisma.invoice.findFirst({
            where: { razorpayPaymentLinkId: paymentLinkId },
            select: { id: true },
          });
          invoiceId = paymentLinkInvoice?.id || null;
        }

        if (!invoiceId) break;

        await recordPaymentEvent(
          invoiceId,
          "payment.failed",
          razorpayEventId,
          (payment.amount as number) || 0,
          (payment.currency as string) || "INR",
          paymentId,
          paymentLinkId || undefined,
          payment as unknown as Record<string, unknown>,
        );
        break;
      }

      default:
        // Unhandled event type — still record it
        break;
    }

    // Emit event for the event bus
    const eventType = event.event as AppEvent["type"];
    await emitEvent({
      type: eventType,
      source: "razorpay",
      payload: event as unknown as Record<string, unknown>,
      razorpayEventId,
    } as AppEvent);

    await prisma.webhookEvent.update({
      where: { id: webhookEventId! },
      data: { status: "PROCESSED", processedAt: new Date(), error: null },
    });

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Razorpay webhook handler failed:", error);
    const message =
      error instanceof Error ? error.message : "Webhook processing failed";
    if (webhookEventId) {
      await prisma.webhookEvent
        .update({
          where: { id: webhookEventId },
          data: { status: "FAILED", error: message },
        })
        .catch(() => undefined);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

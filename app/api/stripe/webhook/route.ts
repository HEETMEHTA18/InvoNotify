import crypto from "node:crypto";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@/lib/db";
import { getStripeWebhookSecret } from "@/lib/stripe";
import { InvoicePaymentError, settleInvoicePayment } from "@/lib/payments/settle-invoice-payment";

export const runtime = "nodejs";

type StripePaymentSource = {
  id: string;
  amount_total?: number;
  currency?: string;
  metadata?: Record<string, string | undefined>;
  payment_intent?: string | { id: string } | null;
};

function parseStripeSignature(signatureHeader: string) {
  const parts = signatureHeader.split(",");
  const timestampPart = parts.find((part) => part.startsWith("t="));
  const signatureParts = parts.filter((part) => part.startsWith("v1="));
  const timestamp = timestampPart?.split("=")[1];
  const signatures = signatureParts
    .map((part) => part.split("=")[1])
    .filter(Boolean);
  return { timestamp, signatures };
}

function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
) {
  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const timestampSeconds = Number(timestamp);
  if (Number.isNaN(timestampSeconds)) {
    return false;
  }

  const toleranceSeconds = 5 * 60;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > toleranceSeconds) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  return signatures.some((candidate) => {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(candidate),
        Buffer.from(expectedSignature),
      );
    } catch {
      return false;
    }
  });
}

async function recordStripePayment(session: StripePaymentSource) {
  const invoiceId = Number(session.metadata?.invoiceId);
  if (!invoiceId || Number.isNaN(invoiceId)) {
    throw new Error("Missing invoice metadata");
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  const transactionId = paymentIntentId || session.id;
  const amountPaid = (session.amount_total || 0) / 100;
  const currency = (session.currency || "inr").toUpperCase();

  if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
    return { status: "ignored" as const, reason: "Provider reported no captured amount" };
  }

  try {
    return await settleInvoicePayment({
      invoiceId,
      amount: amountPaid,
      method: `Stripe Checkout (${currency})`,
      date: new Date(),
      note: `Stripe payment for ${session.metadata?.invoiceNumber || `#${invoiceId}`}`,
      transactionId,
    });
  } catch (error) {
    // A later valid Stripe event can arrive after a different payment already
    // settled the invoice. It is auditable at Stripe but cannot inflate this
    // invoice or recovery ledger.
    if (error instanceof InvoicePaymentError && error.code === "ALREADY_PAID") {
      return { status: "ignored" as const, reason: error.message };
    }
    throw error;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function POST(req: NextRequest) {
  const signature = (await headers()).get("stripe-signature");
  const webhookSecret = getStripeWebhookSecret();

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing webhook signature or secret" },
      { status: 400 },
    );
  }

  let webhookEventId: number | null = null;

  try {
    const rawBody = await req.text();
    if (!verifyStripeSignature(rawBody, signature, webhookSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const event = JSON.parse(rawBody) as {
      id: string;
      type: string;
      data: { object: StripePaymentSource & { payment_status?: string } };
    };

    // Claim the event before handling it. A failure remains retryable; the
    // durable payment/settlement transaction makes that retry safe.
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: { eventId: event.id },
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
            eventId: event.id,
            eventType: event.type,
            payload: event as unknown as object,
            source: "stripe",
            status: "PROCESSING",
          },
        });
        webhookEventId = webhookEvent.id;
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
      }
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.payment_status === "paid") {
          await recordStripePayment(session);
        }
        break;
      }
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as StripePaymentSource & {
          amount_received?: number;
          amount?: number;
        };
        const invoiceId = Number(paymentIntent.metadata?.invoiceId);

        if (!invoiceId || Number.isNaN(invoiceId)) {
          break;
        }

        const session = {
          id: paymentIntent.id,
          amount_total:
            paymentIntent.amount_received || paymentIntent.amount || 0,
          currency: paymentIntent.currency || "inr",
          metadata: paymentIntent.metadata,
          payment_intent: paymentIntent.id,
        } satisfies StripePaymentSource;

        await recordStripePayment(session);
        break;
      }
      default:
        break;
    }

    await prisma.webhookEvent.update({
      where: { id: webhookEventId! },
      data: { status: "PROCESSED", processedAt: new Date(), error: null },
    });

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Stripe webhook handler failed:", error);
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

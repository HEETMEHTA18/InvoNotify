import crypto from "node:crypto";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStripeWebhookSecret } from "@/lib/stripe";

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

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId },
      select: { total: true, amountPaid: true, balance: true, currency: true },
    });

    if (!invoice) {
      throw new Error("Invoice not found");
    }

    const existingPayment = await tx.payment.findFirst({
      where: { transactionId },
      select: { id: true },
    });

    if (existingPayment) {
      return { skipped: true };
    }

    const newAmountPaid = Number(invoice.amountPaid) + amountPaid;
    const newBalance = Math.max(0, Number(invoice.total) - newAmountPaid);
    const newStatus = newBalance <= 0 ? "Paid" : "Pending";

    const payment = await tx.payment.create({
      data: {
        invoiceId,
        amount: amountPaid,
        method: `Stripe Checkout (${currency})`,
        date: new Date(),
        note: `Stripe payment for ${session.metadata?.invoiceNumber || `#${invoiceId}`}`,
        transactionId,
      },
    });

    const updatedInvoice = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaid: newAmountPaid,
        balance: newBalance,
        status: newStatus,
      },
    });

    return { payment, updatedInvoice };
  });
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

  try {
    const rawBody = await req.text();
    if (!verifyStripeSignature(rawBody, signature, webhookSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const event = JSON.parse(rawBody) as {
      type: string;
      data: { object: StripePaymentSource & { payment_status?: string } };
    };

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.payment_status === "paid") {
          await recordStripePayment(session);
        }
        break;
      }
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
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

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Stripe webhook handler failed:", error);
    const message =
      error instanceof Error ? error.message : "Webhook processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

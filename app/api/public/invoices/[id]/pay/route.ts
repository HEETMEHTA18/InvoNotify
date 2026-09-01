import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createPaymentLink } from "@/lib/razorpay";
import { rateLimitResponse, getRateLimitHeaders } from "@/lib/ai/rate-limit";
import { createLogger } from "@/lib/ai/logger";
import { parsePublicInvoiceToken } from "@/lib/security/public-invoice";

export const runtime = "nodejs";

const log = createLogger("api:public:pay");

function getAppUrl() {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.SITE_URL ||
    "http://localhost:3000"
  );
}

/**
 * Public "Pay Now" endpoint. Returns an existing active Razorpay payment link
 * or mints a new one for the invoice's outstanding balance. Rate limited per
 * IP to prevent link-minting abuse.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const rl = rateLimitResponse("recovery:action", `pay:${ip}`);
  if (!rl.ok) {
    return NextResponse.json(rl.body, {
      status: rl.status,
      headers: getRateLimitHeaders("recovery:action", `pay:${ip}`),
    });
  }

  const { id } = await params;
  const publicToken = parsePublicInvoiceToken(id);
  if (!publicToken) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { publicToken },
      select: {
        id: true,
        publicToken: true,
        invoiceNumber: true,
        clientName: true,
        clientEmail: true,
        clientPhone: true,
        balance: true,
        currency: true,
        status: true,
        razorpayPaymentLinkId: true,
        razorpayPaymentLinkUrl: true,
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const amountDue = Number(invoice.balance);
    if (invoice.status === "Paid" || amountDue <= 0) {
      return NextResponse.json({ error: "Invoice is already fully paid" }, { status: 409 });
    }

    // Reuse an existing active link instead of minting duplicates.
    let paymentUrl: string | null = invoice.razorpayPaymentLinkUrl;

    if (!paymentUrl) {
      const link = await createPaymentLink({
        amount: Math.round(amountDue),
        currency: invoice.currency || "INR",
        description: `Invoice ${invoice.invoiceNumber || `#${invoice.id}`}`,
        customer: {
          name: invoice.clientName || undefined,
          email: invoice.clientEmail || undefined,
          contact: invoice.clientPhone || undefined,
        },
        reference_id: String(invoice.id),
        notify: { email: false, sms: false, whatsapp: false },
        callback_url: `${getAppUrl()}/invoice/${publicToken}/pay?payment=success`,
        callback_method: "get",
      });

      paymentUrl = link.short_url;

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          razorpayPaymentLinkId: link.id,
          razorpayPaymentLinkUrl: link.short_url,
        },
      });

      log.info("Public pay link minted", { invoiceId: invoice.id, paymentLinkId: link.id });
    }

    return NextResponse.json(
      { paymentUrl },
      { headers: getRateLimitHeaders("recovery:action", `pay:${ip}`) },
    );
  } catch (error) {
    log.error("Public payment link creation failed", { publicToken, error: String(error) });
    const message =
      error instanceof Error && error.message.includes("Razorpay credentials")
        ? "Payment provider is not configured"
        : "Failed to create payment link";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

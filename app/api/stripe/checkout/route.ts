import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStripeSecretKey } from "@/lib/stripe";

function getAppUrl() {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

function buildStripeFormBody(
  params: Record<string, string | number | undefined>,
) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    form.set(key, String(value));
  }
  return form;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const invoiceId = Number(body?.invoiceId);

    if (!invoiceId || Number.isNaN(invoiceId)) {
      return NextResponse.json(
        { error: "Valid invoiceId is required" },
        { status: 400 },
      );
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, ownerUserId: userId },
      select: {
        id: true,
        total: true,
        balance: true,
        currency: true,
        invoiceNumber: true,
        clientName: true,
        clientEmail: true,
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const amountDue = Number(invoice.balance ?? invoice.total ?? 0);
    if (amountDue <= 0) {
      return NextResponse.json(
        { error: "Invoice is already fully paid" },
        { status: 400 },
      );
    }

    const currency = (invoice.currency || "INR").toLowerCase();
    const appUrl = getAppUrl();
    const stripeSecretKey = getStripeSecretKey();

    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: "STRIPE_SECRET_KEY is not configured" },
        { status: 500 },
      );
    }

    const formBody = buildStripeFormBody({
      mode: "payment",
      success_url: `${appUrl}/invoice/${invoice.id}?payment=success`,
      cancel_url: `${appUrl}/invoice/${invoice.id}?payment=cancel`,
      customer_email: invoice.clientEmail || undefined,
      "line_items[0][quantity]": 1,
      "line_items[0][price_data][currency]": currency,
      "line_items[0][price_data][unit_amount]": Math.round(amountDue * 100),
      "line_items[0][price_data][product_data][name]": `Invoice ${invoice.invoiceNumber || `#${invoice.id}`}`,
      "line_items[0][price_data][product_data][description]": invoice.clientName
        ? `Payment for ${invoice.clientName}`
        : "Invoice payment",
      "metadata[invoiceId]": String(invoice.id),
      "metadata[ownerUserId]": userId,
      "metadata[invoiceNumber]": invoice.invoiceNumber || "",
      "payment_intent_data[metadata][invoiceId]": String(invoice.id),
      "payment_intent_data[metadata][ownerUserId]": userId,
      "payment_intent_data[metadata][invoiceNumber]":
        invoice.invoiceNumber || "",
    });

    const response = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formBody.toString(),
      },
    );

    const checkoutSession = (await response.json()) as {
      url?: string;
      error?: { message?: string };
    };

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            checkoutSession.error?.message ||
            "Failed to create checkout session",
        },
        { status: response.status },
      );
    }

    return NextResponse.json({ url: checkoutSession.url }, { status: 200 });
  } catch (error) {
    console.error("Failed to create Stripe checkout session:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create checkout session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

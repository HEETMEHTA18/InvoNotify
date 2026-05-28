export function getStripeSecretKey() {
  return process.env.STRIPE_SECRET_KEY;
}

export function getStripeWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET;
}

export type StripeCheckoutSessionInput = {
  invoiceId: number;
  invoiceNumber?: string | null;
  amountDue: number;
  currency?: string | null;
  clientEmail?: string | null;
  clientName?: string | null;
  ownerUserId?: string | null;
  appUrl?: string;
};

export async function createStripeCheckoutUrl(input: StripeCheckoutSessionInput) {
  const stripeSecretKey = getStripeSecretKey();
  if (!stripeSecretKey) return null;

  const appUrl = input.appUrl || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const currency = (input.currency || "INR").toLowerCase();
  const amountDueInt = Math.round(Number(input.amountDue) * 100);

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", `${appUrl}/invoice/${input.invoiceId}?payment=success`);
  form.set("cancel_url", `${appUrl}/invoice/${input.invoiceId}?payment=cancel`);
  form.set("automatic_payment_methods[enabled]", "true");
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", currency);
  form.set("line_items[0][price_data][unit_amount]", String(amountDueInt));
  form.set("line_items[0][price_data][product_data][name]", `Invoice ${input.invoiceNumber || `#${input.invoiceId}`}`);
  form.set("line_items[0][price_data][product_data][description]", input.clientName ? `Payment for ${input.clientName}` : "Invoice payment");
  form.set("metadata[invoiceId]", String(input.invoiceId));
  if (input.ownerUserId) form.set("metadata[ownerUserId]", input.ownerUserId);
  if (input.invoiceNumber) form.set("metadata[invoiceNumber]", input.invoiceNumber);
  if (input.clientEmail) form.set("customer_email", input.clientEmail);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const data = (await response.json()) as { url?: string; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data.error?.message || "Failed to create checkout session");
  }

  return data.url || null;
}

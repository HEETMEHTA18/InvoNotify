const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

export function getRazorpayKeyId(): string | undefined {
  return process.env.RAZORPAY_KEY_ID;
}

export function getRazorpayKeySecret(): string | undefined {
  return process.env.RAZORPAY_KEY_SECRET;
}

export function getRazorpayWebhookSecret(): string | undefined {
  return process.env.RAZORPAY_WEBHOOK_SECRET;
}

function getAuthHeader(): string {
  const keyId = getRazorpayKeyId();
  const keySecret = getRazorpayKeySecret();
  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }
  return "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}

async function razorpayRequest<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${RAZORPAY_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await response.json();
  if (!response.ok) {
    const error = data as { error?: { description?: string; code?: string } };
    throw new Error(
      `Razorpay API error: ${error.error?.description || response.statusText} (${error.error?.code || response.status})`,
    );
  }
  return data as T;
}

// ── Payment Links ────────────────────────────────────────────────────────────

export type RazorpayPaymentLinkInput = {
  amount: number;
  currency?: string;
  description?: string;
  customer?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notify?: {
    email?: boolean;
    sms?: boolean;
    whatsapp?: boolean;
  };
  reference_id?: string;
  callback_url?: string;
  callback_method?: "get" | "post";
};

export type RazorpayPaymentLink = {
  id: string;
  entity: "payment_link";
  amount: number;
  amount_paid: number;
  currency: string;
  description: string | null;
  status: "created" | "partial" | "paid" | "expired" | "cancelled";
  customer: {
    name: string | null;
    email: string | null;
    contact: string | null;
  } | null;
  short_url: string | null;
  reference_id: string | null;
  created_at: number;
  updated_at: number;
  payments_count: number;
  payments_amount: number;
};

export async function createPaymentLink(input: RazorpayPaymentLinkInput): Promise<RazorpayPaymentLink> {
  return razorpayRequest<RazorpayPaymentLink>("POST", "/payment_links", {
    amount: Math.round(input.amount * 100), // Razorpay expects paise
    currency: input.currency || "INR",
    description: input.description,
    customer: input.customer,
    notify: input.notify ?? { email: true, sms: false, whatsapp: false },
    reference_id: input.reference_id,
    callback_url: input.callback_url,
    callback_method: input.callback_method,
  });
}

export async function fetchPaymentLink(paymentLinkId: string): Promise<RazorpayPaymentLink> {
  return razorpayRequest<RazorpayPaymentLink>("GET", `/payment_links/${paymentLinkId}`);
}

export async function cancelPaymentLink(paymentLinkId: string): Promise<RazorpayPaymentLink> {
  return razorpayRequest<RazorpayPaymentLink>("POST", `/payment_links/${paymentLinkId}/cancel`);
}

export async function resendPaymentLink(paymentLinkId: string): Promise<RazorpayPaymentLink> {
  return razorpayRequest<RazorpayPaymentLink>("POST", `/payment_links/${paymentLinkId}/resend`);
}

// ── Payments ─────────────────────────────────────────────────────────────────

export type RazorpayPayment = {
  id: string;
  entity: "payment";
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  order_id: string | null;
  invoice_id: string | null;
  payment_link_id: string | null;
  method: string;
  description: string | null;
  created_at: number;
};

export async function fetchPayment(paymentId: string): Promise<RazorpayPayment> {
  return razorpayRequest<RazorpayPayment>("GET", `/payments/${paymentId}`);
}

// ── Webhook Signature Verification ───────────────────────────────────────────

import crypto from "node:crypto";

export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expectedSignature),
    );
  } catch {
    return false;
  }
}

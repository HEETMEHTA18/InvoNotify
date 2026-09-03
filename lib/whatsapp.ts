/**
 * WhatsApp Business Cloud API client (Meta Cloud API).
 *
 * Pricing (as of July 2025):
 *   - Non-template text messages: FREE (within 24h customer service window)
 *   - Utility templates within CSW: FREE
 *   - Test accounts: 1,000 free messages/month
 *
 * Env vars required:
 *   WHATSAPP_PHONE_NUMBER_ID  — from Meta App Dashboard > WhatsApp > API Setup
 *   WHATSAPP_ACCESS_TOKEN     — permanent System User token (or temporary for testing)
 *   WHATSAPP_API_VERSION      — optional, defaults to "v21.0"
 */

const GRAPH_API_BASE = "https://graph.facebook.com";

type WhatsAppSendResult =
  | { ok: true; messageId: string; raw: Record<string, unknown> }
  | { ok: false; error: string; code?: number; raw?: Record<string, unknown> };

function getConfig() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";

  if (!phoneNumberId || !accessToken) {
    return null;
  }
  return { phoneNumberId, accessToken, apiVersion };
}

/**
 * Check if WhatsApp is configured and ready to send.
 */
export function isWhatsAppConfigured(): boolean {
  return getConfig() !== null;
}

/**
 * Normalize an Indian phone number to E.164 without the '+' prefix.
 * Accepts: "+919876543210", "919876543210", "09876543210", "9876543210"
 */
function normalizePhone(raw: string): string {
  let cleaned = raw.replace(/[^0-9+]/g, "");
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
  // Indian numbers: if starts with 0, drop it and prepend 91
  if (cleaned.startsWith("0") && cleaned.length === 11) {
    cleaned = "91" + cleaned.slice(1);
  }
  // If 10 digits, assume Indian
  if (cleaned.length === 10) {
    cleaned = "91" + cleaned;
  }
  return cleaned;
}

/**
 * Send a plain-text WhatsApp message via Meta Cloud API.
 *
 * This is a non-template (session) message — FREE when sent within
 * an open 24-hour customer service window.
 *
 * @param to - Recipient phone number (any common format)
 * @param text - Message body (max 4096 chars)
 */
export async function sendWhatsAppMessage(
  to: string,
  text: string,
): Promise<WhatsAppSendResult> {
  const config = getConfig();
  if (!config) {
    return { ok: false, error: "WhatsApp not configured (missing env vars)" };
  }

  const phone = normalizePhone(to);
  if (phone.length < 10 || phone.length > 15) {
    return { ok: false, error: `Invalid phone number: ${to}` };
  }

  const truncated = text.slice(0, 4096);
  const url = `${GRAPH_API_BASE}/${config.apiVersion}/${config.phoneNumberId}/messages`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "text",
        text: { body: truncated },
      }),
    });

    const body = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const errorMsg =
        (body.error as { message?: string })?.message ||
        `HTTP ${response.status}`;
      const errorCode = (body.error as { code?: number })?.code;
      console.error("[whatsapp] Send failed:", errorMsg, errorCode);
      return { ok: false, error: errorMsg, code: errorCode, raw: body };
    }

    const messages = body.messages as Array<{ id?: string }> | undefined;
    const messageId = messages?.[0]?.id || "unknown";
    return { ok: true, messageId, raw: body };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[whatsapp] Send exception:", msg);
    return { ok: false, error: msg };
  }
}

/**
 * Send a WhatsApp template message.
 *
 * Templates are required for business-initiated messages outside the
 * 24h customer service window. Utility templates sent WITHIN the CSW
 * are free.
 *
 * @param to - Recipient phone number
 * @param templateName - Approved template name (e.g. "payment_reminder")
 * @param languageCode - Language code (e.g. "en_US", "hi")
 * @param parameters - Template parameters as [{ type: "text", text: "value" }]
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string = "en_US",
  parameters?: Array<{ type: string; text: string }>,
): Promise<WhatsAppSendResult> {
  const config = getConfig();
  if (!config) {
    return { ok: false, error: "WhatsApp not configured (missing env vars)" };
  }

  const phone = normalizePhone(to);
  const url = `${GRAPH_API_BASE}/${config.apiVersion}/${config.phoneNumberId}/messages`;

  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: languageCode },
  };
  if (parameters && parameters.length > 0) {
    template.components = [
      { type: "body", parameters },
    ];
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "template",
        template,
      }),
    });

    const body = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const errorMsg =
        (body.error as { message?: string })?.message ||
        `HTTP ${response.status}`;
      const errorCode = (body.error as { code?: number })?.code;
      console.error("[whatsapp] Template send failed:", errorMsg, errorCode);
      return { ok: false, error: errorMsg, code: errorCode, raw: body };
    }

    const messages = body.messages as Array<{ id?: string }> | undefined;
    const messageId = messages?.[0]?.id || "unknown";
    return { ok: true, messageId, raw: body };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[whatsapp] Template send exception:", msg);
    return { ok: false, error: msg };
  }
}

/**
 * Send an invoice payment reminder via WhatsApp.
 *
 * Builds a concise, mobile-friendly message with the payment link.
 * Uses a non-template text message (free within CSW).
 */
export async function sendWhatsAppPaymentReminder(params: {
  to: string;
  customerName: string;
  invoiceNumber: string;
  amountDue: string;
  currency: string;
  dueDate: string | null;
  paymentLinkUrl: string | null;
  daysOverdue: number;
  senderName: string;
}): Promise<WhatsAppSendResult> {
  const {
    to,
    customerName,
    invoiceNumber,
    amountDue,
    currency,
    dueDate,
    paymentLinkUrl,
    daysOverdue,
    senderName,
  } = params;

  const overdueLine =
    daysOverdue > 0
      ? `\n⚠️ This invoice is ${daysOverdue} day${daysOverdue > 1 ? "s" : ""} overdue.`
      : "";

  const paymentLine = paymentLinkUrl
    ? `\n\n💳 Pay now: ${paymentLinkUrl}`
    : "";

  const body = [
    `Hi ${customerName || "there"},`,
    ``,
    `This is a payment reminder from ${senderName || "InvoNotify"}.`,
    ``,
    `📋 Invoice: #${invoiceNumber}`,
    `💰 Amount: ${currency} ${amountDue}`,
    dueDate ? `📅 Due: ${dueDate}` : null,
    overdueLine,
    paymentLine,
    ``,
    paymentLinkUrl
      ? `Need help? Reply to this message.`
      : `To pay, please contact us or visit your invoice portal.`,
  ]
    .filter(Boolean)
    .join("\n");

  return sendWhatsAppMessage(to, body);
}

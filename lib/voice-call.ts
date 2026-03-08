/**
 * voice-call.ts — FREE Voice Reminder Agent
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses VAPI.ai (FREE $10 credit on signup, no credit card needed)
 *   → https://vapi.ai
 *
 * Why VAPI over others?
 *   ✅ $10 free credit = ~100+ minutes of calling
 *   ✅ Works with Indian phone numbers
 *   ✅ Supports custom TTS voices (we plug in Sarvam's voice)
 *   ✅ Built-in conversation flow, retries, DTMF handling
 *   ✅ No Twilio needed (VAPI has its own telephony)
 *   ✅ Simple REST API — one POST call to trigger a call
 *
 * Sign up at: https://dashboard.vapi.ai → Copy your Private API Key
 * Add VAPI_API_KEY to .env
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VoiceCallParams {
    toPhone: string;        // Customer's phone number
    clientName: string;     // For the voice script
    invoiceNumber: string;  // Invoice reference
    balance: number;        // Outstanding amount
    currency: string;       // "INR", "USD", etc.
    dueDate: Date | null;
    senderName: string;     // Your business name
    invoiceId: number;      // For logging
}

export type VoiceCallResult =
    | { success: true; callId: string; provider: string }
    | { success: false; error: string };

// ─── Phone Normalizer ─────────────────────────────────────────────────────────

function normalizePhone(phone: string): string {
    const cleaned = phone.trim().replace(/[\s\-().]/g, "");
    if (cleaned.startsWith("+")) return cleaned;
    if (cleaned.startsWith("91") && cleaned.length === 12) return `+${cleaned}`;
    if (cleaned.length === 10) return `+91${cleaned}`;
    return `+${cleaned}`;
}

// ─── Script Builder ───────────────────────────────────────────────────────────

function buildReminderScript(params: VoiceCallParams): string {
    const { clientName, invoiceNumber, balance, currency, dueDate, senderName } = params;
    const dueStr = dueDate
        ? new Date(dueDate).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
        })
        : "as soon as possible";
    const currencyWord = currency === "INR" ? "rupees" : currency;

    return (
        `Hello ${clientName}, this is an automated reminder from ${senderName}. ` +
        `Your invoice number ${invoiceNumber} has an outstanding balance of ${currencyWord} ${balance.toFixed(2)}, ` +
        `which is due on ${dueStr}. ` +
        `We kindly urge you to clear this payment at your earliest convenience. ` +
        `If you have already made this payment, please disregard this message. ` +
        `For any queries, please contact us directly. Thank you.`
    );
}

// ─── VAPI Provider ────────────────────────────────────────────────────────────

/**
 * Makes an outbound call using VAPI.ai (free tier)
 *
 * VAPI handles:
 *  - The phone call infrastructure
 *  - Text-to-speech (built-in voices OR Sarvam custom voice)
 *  - Conversation flow
 *  - Retries if customer doesn't pick up
 */
async function callWithVapi(params: VoiceCallParams): Promise<VoiceCallResult> {
    const apiKey = process.env.VAPI_API_KEY;
    if (!apiKey) {
        return { success: false, error: "VAPI_API_KEY not set. Sign up free at https://vapi.ai" };
    }

    const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
    if (!phoneNumberId) {
        return { success: false, error: "VAPI_PHONE_NUMBER_ID not set. Buy/import a number in VAPI dashboard." };
    }

    const script = buildReminderScript(params);
    const formattedPhone = normalizePhone(params.toPhone);

    // If a pre-built assistant ID is set (e.g. "Riley" from your dashboard), use it directly.
    // This is simplest — Riley’s voice, model, and behaviour are already configured in VAPI.
    const assistantId = process.env.VAPI_ASSISTANT_ID;

    const payload = assistantId
        ? {
            // ── Use pre-built "Riley" assistant ─────────────────────────────
            phoneNumberId,
            customer: { number: formattedPhone, name: params.clientName },
            assistantId,
            // Override only the first message with our generated reminder script
            assistantOverrides: {
                firstMessage: script,
                variableValues: {
                    clientName: params.clientName,
                    invoiceNumber: params.invoiceNumber,
                    balance: params.balance.toFixed(2),
                    currency: params.currency,
                    dueDate: params.dueDate
                        ? new Date(params.dueDate).toLocaleDateString("en-IN", {
                            day: "numeric", month: "long", year: "numeric",
                        })
                        : "as soon as possible",
                    senderName: params.senderName,
                },
            },
        }
        : {
            // ── Inline assistant config (no dashboard setup needed) ────────────
            phoneNumberId,
            customer: { number: formattedPhone, name: params.clientName },
            assistant: {
                name: "Payment Reminder Agent",
                ...(process.env.SARVAM_API_KEY
                    ? {
                        voice: {
                            provider: "custom-voice",
                            voiceId: "meera",
                            url: `${process.env.SITE_URL}/api/vapi/tts`,
                        },
                    }
                    : {
                        voice: { provider: "playht", voiceId: "jennifer" },
                    }),
                firstMessage: script,
                model: {
                    provider: "openai",
                    model: "gpt-3.5-turbo",
                    messages: [
                        {
                            role: "system",
                            content:
                                `You are a polite payment reminder agent for ${params.senderName}. ` +
                                `You called ${params.clientName} about invoice ${params.invoiceNumber} ` +
                                `with a balance of ${params.currency} ${params.balance.toFixed(2)}. ` +
                                `Be polite, professional, and brief. ` +
                                `If they say they’ve paid, apologize. ` +
                                `If they ask for an extension, say the accounts team will follow up. ` +
                                `End the call gracefully after the reminder is acknowledged.`,
                        },
                    ],
                },
                maxDurationSeconds: 120,
                silenceTimeoutSeconds: 10,
                endCallMessage: "Thank you for your time. Goodbye.",
            },
        };

    try {
        const response = await fetch("https://api.vapi.ai/call/phone", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const err = await response.text();
            console.error("VAPI call error:", response.status, err);
            return { success: false, error: `VAPI error ${response.status}: ${err}` };
        }

        const data = await response.json();
        console.log("VAPI call initiated:", data.id);
        return { success: true, callId: data.id, provider: "vapi" };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { success: false, error: `Network error: ${msg}` };
    }
}

// ─── Twilio Fallback (if VAPI not set) ────────────────────────────────────────

/**
 * Simple Twilio fallback using basic TwiML <Say>
 * Uses your existing Twilio trial credentials (already in .env)
 * No Vercel Blob needed — uses Amazon Polly's Aditi voice (free, Indian accent)
 */
async function callWithTwilio(params: VoiceCallParams): Promise<VoiceCallResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromPhone) {
        return { success: false, error: "Twilio credentials missing" };
    }

    const twilio = (await import("twilio")).default;
    const client = twilio(accountSid, authToken);
    const script = buildReminderScript(params);
    const formattedPhone = normalizePhone(params.toPhone);
    const siteUrl = process.env.SITE_URL || "http://localhost:3000";

    // Use <Say> with Polly.Aditi — Indian English voice, free with Twilio
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">${script}</Say>
  <Pause length="2"/>
  <Say voice="Polly.Aditi" language="en-IN">
    Press 1 to confirm you received this message, or simply hang up. Thank you.
  </Say>
  <Gather numDigits="1" action="${siteUrl}/api/reminders/voice-dtmf?invoiceId=${params.invoiceId}" method="POST" timeout="8">
    <Pause length="8"/>
  </Gather>
</Response>`;

    try {
        const call = await client.calls.create({
            to: formattedPhone,
            from: fromPhone,
            twiml,
        });
        console.log("Twilio call initiated:", call.sid);
        return { success: true, callId: call.sid, provider: "twilio" };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { success: false, error: `Twilio error: ${msg}` };
    }
}

// ─── Main Export — Auto-selects best available provider ───────────────────────

/**
 * makeVoiceCallReminder()
 *
 * Priority order (uses first one that's configured):
 *   1. VAPI.ai  (free $10 credit, best quality, supports Sarvam voice)
 *   2. Twilio   (trial credits in your .env, Amazon Polly Indian voice)
 *
 * Set VAPI_API_KEY + VAPI_PHONE_NUMBER_ID in .env for best results.
 */
export async function makeVoiceCallReminder(
    params: VoiceCallParams
): Promise<VoiceCallResult> {
    // Prefer VAPI if configured
    if (process.env.VAPI_API_KEY) {
        const result = await callWithVapi(params);
        if (result.success) return result;
        console.warn("VAPI failed, falling back to Twilio:", result.error);
    }

    // Fallback to Twilio
    if (process.env.TWILIO_ACCOUNT_SID) {
        return callWithTwilio(params);
    }

    return {
        success: false,
        error: "No voice provider configured. Add VAPI_API_KEY (free) or TWILIO credentials.",
    };
}

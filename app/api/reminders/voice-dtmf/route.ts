/**
 * POST /api/reminders/voice-dtmf
 *
 * Handles keypress responses from Twilio calls (when using Twilio fallback).
 * VAPI handles this internally — this route is only needed for Twilio mode.
 *
 * Query params: ?invoiceId=123
 * Twilio POST body: Digits=1 (or 2)
 */
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const digit = params.get("Digits");
    const invoiceId = req.nextUrl.searchParams.get("invoiceId");

    console.log(`DTMF received: digit=${digit}, invoiceId=${invoiceId}`);

    let message: string;
    if (digit === "1") {
        message = "Thank you for confirming. We look forward to receiving your payment. Goodbye.";
    } else if (digit === "2") {
        message = "Thank you. A member of our team will reach out to you shortly. Goodbye.";
    } else {
        message = "Thank you for your time. Goodbye.";
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">${message}</Say>
</Response>`;

    return new NextResponse(twiml, {
        headers: { "Content-Type": "application/xml" },
    });
}

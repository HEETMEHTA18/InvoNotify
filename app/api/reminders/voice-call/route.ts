/**
 * POST /api/reminders/voice-call
 *
 * Triggers an outbound AI voice call to a customer reminding them of an
 * outstanding invoice. Uses VAPI.ai (free) or Twilio as fallback.
 *
 * Body: { invoiceId: number }
 * Auth: Requires valid session (dashboard user only — not a cron endpoint)
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { makeVoiceCallReminder } from "@/lib/voice-call";

export async function POST(req: NextRequest) {
    // Auth guard — only logged-in users can trigger calls
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let invoiceId: number;
    try {
        const body = await req.json();
        invoiceId = Number(body.invoiceId);
        if (!invoiceId || isNaN(invoiceId)) throw new Error("invalid");
    } catch {
        return NextResponse.json({ error: "invoiceId (number) is required" }, { status: 400 });
    }

    // Fetch invoice and verify it belongs to the current user
    const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: {
            id: true,
            invoiceNumber: true,
            clientName: true,
            clientPhone: true,
            balance: true,
            currency: true,
            dueDate: true,
            status: true,
            ownerUserId: true,
            senderName: true,
        },
    });

    if (!invoice) {
        return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (invoice.ownerUserId !== session.user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (invoice.status === "Paid" || Number(invoice.balance) <= 0) {
        return NextResponse.json({ error: "Invoice is already paid" }, { status: 400 });
    }
    if (!invoice.clientPhone?.trim()) {
        return NextResponse.json(
            { error: "No phone number on this invoice. Add the client's phone number first." },
            { status: 400 }
        );
    }

    // Trigger the voice call
    const result = await makeVoiceCallReminder({
        toPhone: invoice.clientPhone,
        clientName: invoice.clientName || "Valued Customer",
        invoiceNumber: invoice.invoiceNumber,
        balance: Number(invoice.balance),
        currency: invoice.currency,
        dueDate: invoice.dueDate,
        senderName: invoice.senderName || "Invoice Management",
        invoiceId: invoice.id,
    });

    if (!result.success) {
        console.error("Voice call failed:", result.error);
        return NextResponse.json({ error: result.error }, { status: 502 });
    }

    // Log the voice call as a reminder
    try {
        await prisma.invoiceReminderLog.create({
            data: {
                invoiceId: invoice.id,
                reminderKey: `VOICE-CALL-${result.callId}`,
                reminderType: "MANUAL",
                targetDate: new Date(),
            },
        });
    } catch (logError) {
        // Non-critical — call was already made, just log warning
        console.warn("Could not log voice call reminder:", logError);
    }

    return NextResponse.json({
        success: true,
        callId: result.callId,
        provider: result.provider,
        message: `Voice call initiated to ${invoice.clientPhone}`,
    });
}

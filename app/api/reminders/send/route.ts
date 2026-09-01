import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendInvoiceReminderById } from "@/lib/mail-service";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let invoiceId: number;
    try {
      const body = await req.json();
      invoiceId = Number(body.invoiceId);
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!Number.isInteger(invoiceId)) {
      return NextResponse.json({ error: "Invoice ID is required" }, { status: 400 });
    }

    // The mail service intentionally also serves cron jobs, so enforce tenant
    // ownership at this user-controlled entry point before it can send a
    // reminder for an arbitrary numeric invoice ID.
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        OR: [{ ownerUserId: session.user.id }, { userId: session.user.id }],
      },
      select: { id: true },
    });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const result = await sendInvoiceReminderById({
      invoiceId,
      reminderType: "MANUAL",
      fallbackUserId: session.user.id,
    });

    if (!result.sent) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: "Reminder sent successfully!" });
  } catch (error) {
    console.error("Failed to send reminder:", error);
    return NextResponse.json({ error: "Failed to send reminder" }, { status: 500 });
  }
}

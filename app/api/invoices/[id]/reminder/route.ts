import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { sendInvoiceReminderById } from "@/lib/mail-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const invoiceId = Number(id);
    if (!Number.isInteger(invoiceId)) {
      return NextResponse.json({ error: "Invalid invoice id" }, { status: 400 });
    }

    // Verify ownership
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { ownerUserId: true }
    });

    if (!invoice || (invoice.ownerUserId && invoice.ownerUserId !== session.user.id)) {
      return NextResponse.json({ error: "Unauthorized or invoice not found" }, { status: 404 });
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
    console.error("Reminder Error:", error);
    return NextResponse.json({ error: "Failed to send reminder" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/utils/auth";
import { sendInvoiceReminderById } from "@/app/utils/sendInvoiceReminder";

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

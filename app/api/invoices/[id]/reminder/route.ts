import { NextRequest, NextResponse } from "next/server";

// This is a placeholder for sending a reminder email for an invoice.
// In a real app, you would integrate with an email service here.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // You could fetch invoice details from DB if needed
  // const invoiceId = params.id;
  // ...fetch invoice, get email, etc.

  // Simulate sending email
  await new Promise(res => setTimeout(res, 500));

  return NextResponse.json({ success: true, message: "Reminder email sent (simulated)." });
}

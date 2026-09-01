import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { InvoicePaymentError, settleInvoicePayment } from "@/lib/payments/settle-invoice-payment";

// POST: Record a manual/reconciled payment. Provider webhook routes use the
// same settlement service, so this path cannot bypass the recovery ledger.
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await req.json();
    const { invoiceId, amount, method, date, note, transactionId } = data;
    const invId = Number(invoiceId);
    const paymentAmount = Number(amount);
    if (!Number.isInteger(invId) || invId <= 0 || !Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return NextResponse.json(
        { error: "Invoice ID and amount must be positive" },
        { status: 400 },
      );
    }

    const paymentDate = date ? new Date(date) : undefined;
    if (paymentDate && Number.isNaN(paymentDate.getTime())) {
      return NextResponse.json({ error: "Payment date is invalid" }, { status: 400 });
    }

    const result = await settleInvoicePayment({
      invoiceId: invId,
      amount: paymentAmount,
      method: typeof method === "string" && method.trim() ? method.trim() : "Manual",
      date: paymentDate,
      note: typeof note === "string" ? note : null,
      transactionId: typeof transactionId === "string" ? transactionId : null,
      ownerUserId: userId,
    });

    if (result.status === "duplicate") {
      return NextResponse.json(
        { duplicate: true, paymentId: result.paymentId },
        { status: 200 },
      );
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error("Failed to record payment:", error);
    if (error instanceof InvoicePaymentError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "NOT_FOUND" ? 404 : 409 },
      );
    }
    const message = error instanceof Error ? error.message : "Failed to record payment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

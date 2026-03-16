import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

// POST: Record a payment
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        const userId = session?.user?.id;
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const data = await req.json();
        const { invoiceId, amount, method, date, note, transactionId } = data;

        if (!invoiceId || !amount) {
            return NextResponse.json({ error: "Invoice ID and amount are required" }, { status: 400 });
        }

        const invId = Number(invoiceId);
        const amt = Number(amount);

        // Use a transaction to ensure atomic update
        const result = await prisma.$transaction(async (tx) => {
            // 1. Fetch current invoice state WITH ownership check
            const invoice = await tx.invoice.findFirst({
                where: { id: invId, ownerUserId: userId },
                select: { total: true, amountPaid: true, balance: true }
            });

            if (!invoice) throw new Error("Invoice not found or unauthorized");

            // 2. Create the payment record
            const payment = await tx.payment.create({
                data: {
                    invoiceId: invId,
                    amount: amt,
                    method: method || "Manual",
                    date: date ? new Date(date) : new Date(),
                    note: note || "",
                    transactionId: transactionId || "",
                },
            });

            // 3. Update invoice balance and status
            const newAmountPaid = Number(invoice.amountPaid) + amt;
            const newBalance = Math.max(0, Number(invoice.total) - newAmountPaid);
            const newStatus = newBalance <= 0 ? "Paid" : "Pending";

            const updatedInvoice = await tx.invoice.update({
                where: { id: invId },
                data: {
                    amountPaid: newAmountPaid,
                    balance: newBalance,
                    status: newStatus,
                },
            });

            return { payment, updatedInvoice };
        });

        return NextResponse.json(result, { status: 201 });
    } catch (error: any) {
        console.error("Failed to record payment:", error);
        return NextResponse.json({ error: error.message || "Failed to record payment" }, { status: 500 });
    }
}

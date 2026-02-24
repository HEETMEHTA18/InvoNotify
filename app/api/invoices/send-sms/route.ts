import { NextRequest, NextResponse } from "next/server";
import { sendSMS } from "@/lib/sms";
import { prisma } from "@/app/utils/db";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { invoiceId, phoneNumber } = body;

        if (!invoiceId) {
            return NextResponse.json(
                { error: "Invoice ID is required" },
                { status: 400 }
            );
        }

        const id = parseInt(invoiceId);
        if (isNaN(id)) {
            return NextResponse.json({ error: "Invalid Invoice ID" }, { status: 400 });
        }

        const invoice = await prisma.invoice.findUnique({
            where: { id },
        });

        if (!invoice) {
            return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
        }

        const targetPhone = String(phoneNumber || invoice.clientPhone || "").trim();
        if (!targetPhone) {
            return NextResponse.json({ error: "Client phone is missing" }, { status: 400 });
        }

        // Format amount with currency symbol
        const currency = invoice.currency || "INR";
        const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "₹";
        const amount = `${symbol}${invoice.total.toFixed(2)}`;

        const message = `From ${invoice.senderName}: New Invoice #${invoice.invoiceNumber} for ${amount} is ready. Due date: ${new Date(invoice.dueDate || invoice.date).toLocaleDateString()}.`;

        await sendSMS(targetPhone, message);

        return NextResponse.json({ success: true, message: "SMS sent successfully" });
    } catch (error) {
        console.error("SMS send error:", error);
        return NextResponse.json(
            { error: "Failed to send SMS" },
            { status: 500 }
        );
    }
}

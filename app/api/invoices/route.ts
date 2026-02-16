import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/utils/db";

// GET: List all invoices
export async function GET() {
  try {
    const invoices = await prisma.invoice.findMany({
      include: { items: true },
      orderBy: { date: "desc" },
    });
    return NextResponse.json(invoices);
  } catch (error) {
    console.error("Failed to fetch invoices:", error);
    return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 });
  }
}

// POST: Create a new invoice with line items
export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const {
      senderName,
      senderEmail,
      senderAddress,
      clientName,
      clientEmail,
      clientAddress,
      invoiceNumber,
      date,
      dueDate,
      status,
      currency,
      note,
      items, // Array of { description, quantity, rate, amount }
    } = data;

    if (!clientName || !clientEmail || !date || !items || items.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: clientName, clientEmail, date, and at least one item" },
        { status: 400 }
      );
    }

    // Calculate totals
    const subtotal = items.reduce(
      (sum: number, item: { amount: number }) => sum + Number(item.amount),
      0
    );
    const total = subtotal; // Tax can be added later

    const invoice = await prisma.invoice.create({
      data: {
        senderName: senderName || "",
        senderEmail: senderEmail || "",
        senderAddress: senderAddress || "",
        clientName,
        clientEmail,
        clientAddress: clientAddress || "",
        invoiceNumber: invoiceNumber || `INV-${Date.now()}`,
        date: new Date(date),
        dueDate: dueDate ? new Date(dueDate) : null,
        status: status || "Pending",
        currency: currency || "USD",
        note: note || "",
        subtotal,
        tax: 0,
        total,
        // Legacy
        customer: clientName,
        amount: total,
        items: {
          create: items.map(
            (item: { description: string; quantity: number; rate: number; amount: number }) => ({
              description: item.description,
              quantity: Number(item.quantity),
              rate: Number(item.rate),
              amount: Number(item.amount),
            })
          ),
        },
      },
      include: { items: true },
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error("Failed to create invoice:", error);
    return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
  }
}

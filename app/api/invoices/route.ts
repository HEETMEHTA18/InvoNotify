import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/utils/db";

// GET: List all invoices
import { auth } from "@/app/utils/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const invoices = await prisma.invoice.findMany({
      where: { userId: session.user.id },
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
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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

    const itemsSum = items.reduce(
      (sum: number, item: { amount: number }) => sum + Number(item.amount),
      0
    );

    // Use provided subtotal or calculated one
    const subtotal = itemsSum;
    const discount = Number(data.discount) || 0;
    const taxRate = Number(data.taxRate) || 0;
    const gstType = data.gstType || "INTRA";

    // Calculate tax breakdown
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    const taxableAmount = Math.max(0, subtotal - discount);
    const totalTax = (taxableAmount * taxRate) / 100;

    if (gstType === "INTRA") {
      cgst = totalTax / 2;
      sgst = totalTax / 2;
    } else {
      igst = totalTax;
    }

    const total = taxableAmount + totalTax;
    const template = data.template || "Standard";

    const invoice = await prisma.invoice.create({
      data: {
        userId: session.user.id,
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
        currency: currency || "INR",
        template,
        note: note || "",
        subtotal,
        discount,
        taxRate,
        tax: totalTax,
        gstType,
        cgst,
        sgst,
        igst,
        total,
        amountPaid: 0,
        balance: total,
        // Legacy
        customer: clientName,
        amount: total,
        items: {
          create: items.map(
            (item: { description: string; hsnCode?: string; quantity: number; rate: number; amount: number }) => ({
              description: item.description,
              hsnCode: item.hsnCode || null,
              quantity: Number(item.quantity),
              rate: Number(item.rate),
              amount: Number(item.amount),
            })
          ),
        },
      },
      include: { items: true },
    } as any);

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error("Failed to create invoice:", error);
    return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
  }
}

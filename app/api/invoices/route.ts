import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/utils/db";
import { auth } from "@/app/utils/auth";
import { normalizeReminderSettings, normalizeReminderChannel } from "@/app/utils/invoiceReminders";

function isReminderSchemaMismatch(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("autoReminderEnabled") ||
    message.includes("ownerUserId") ||
    message.includes("clientPhone") ||
    message.includes("reminderOffsets") ||
    message.includes("reminderChannel") ||
    message.includes("overdueReminderEnabled") ||
    message.includes("overdueReminderEveryDays") ||
    message.includes("column does not exist") ||
    message.includes("Unknown arg") ||
    message.includes("Unknown field")
  );
}

// GET: List all invoices
export async function GET(req: NextRequest) {
  try {
    const withItems = req.nextUrl.searchParams.get("withItems") === "true";

    const baseSelect = {
      id: true,
      invoiceNumber: true,
      clientName: true,
      clientEmail: true,
      clientAddress: true,
      senderName: true,
      senderEmail: true,
      senderAddress: true,
      total: true,
      subtotal: true,
      status: true,
      date: true,
      dueDate: true,
      currency: true,
      note: true,
      customer: true,
      amount: true,
      amountPaid: true,
      balance: true,
    };

    const invoices = withItems
      ? await prisma.invoice.findMany({
        include: {
          items: {
            select: {
              id: true,
              description: true,
              hsnCode: true,
              quantity: true,
              rate: true,
              amount: true,
            },
          },
        },
        orderBy: { date: "desc" },
      })
      : await (async () => {
        try {
          return await prisma.invoice.findMany({
            select: {
              ...baseSelect,
              clientPhone: true,
              autoReminderEnabled: true,
              reminderOffsets: true,
              reminderChannel: true,
              overdueReminderEnabled: true,
              overdueReminderEveryDays: true,
            },
            orderBy: { date: "desc" },
          });
        } catch (error) {
          if (!isReminderSchemaMismatch(error)) throw error;
          return prisma.invoice.findMany({
            select: baseSelect,
            orderBy: { date: "desc" },
          });
        }
      })();
    return NextResponse.json(invoices);
  } catch (error) {
    console.error("Failed to fetch invoices:", error);
    return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 });
  }
}

// POST: Create a new invoice with line items
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const data = await req.json();
    const {
      senderName,
      senderEmail,
      senderAddress,
      clientName,
      clientEmail,
      clientPhone,
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
    const reminderSettings = normalizeReminderSettings({
      autoReminderEnabled: data.autoReminderEnabled,
      reminderOffsets: data.reminderOffsets,
      overdueReminderEnabled: data.overdueReminderEnabled,
      overdueReminderEveryDays: data.overdueReminderEveryDays,
      reminderChannel: data.reminderChannel,
      dueDate,
    });
    const reminderChannel = normalizeReminderChannel(data.reminderChannel);

    if (reminderChannel !== "EMAIL" && !String(clientPhone || "").trim()) {
      return NextResponse.json(
        { error: "Client phone is required for SMS or Both reminder channel" },
        { status: 400 }
      );
    }

    const baseCreateData = {
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
    };

    const reminderCreateData = {
      ownerUserId: session?.user?.id || null,
      clientPhone: clientPhone || "",
      autoReminderEnabled: reminderSettings.autoReminderEnabled,
      reminderOffsets: reminderSettings.reminderOffsets,
      reminderChannel: reminderSettings.reminderChannel,
      overdueReminderEnabled: reminderSettings.overdueReminderEnabled,
      overdueReminderEveryDays: reminderSettings.overdueReminderEveryDays,
    };

    let invoice;
    try {
      invoice = await prisma.invoice.create({
        data: {
          ...baseCreateData,
          ...reminderCreateData,
        },
        include: { items: true },
      });
    } catch (error) {
      if (!isReminderSchemaMismatch(error)) throw error;
      invoice = await prisma.invoice.create({
        data: baseCreateData,
        include: { items: true },
      });
    }

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error("Failed to create invoice:", error);
    return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
  }
}

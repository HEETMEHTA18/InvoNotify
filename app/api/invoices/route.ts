import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { normalizeReminderSettings, normalizeReminderChannel } from "@/lib/reminders";

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isInvoiceNumberUniqueViolation(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Invoice_invoiceNumber_ownerUserId_key") || message.includes("Unique constraint failed");
}

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

function isReminderLogDuplicateError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("invoiceId") &&
    message.includes("reminderKey") &&
    message.includes("Unique constraint failed")
  );
}

// GET: List all invoices
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const withItems = req.nextUrl?.searchParams?.get("withItems") === "true";
    const limit = Math.min(parsePositiveInt(req.nextUrl?.searchParams?.get("limit"), 50), 100);
    const cursorParam = req.nextUrl?.searchParams?.get("cursor");
    const cursor = cursorParam ? Number(cursorParam) : null;
    const usePagination = req.nextUrl?.searchParams?.has("limit") || req.nextUrl?.searchParams?.has("cursor");
    const userId = session.user.id;
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
      autoReminderEnabled: true,
      reminderOffsets: true,
      reminderChannel: true,
      overdueReminderEnabled: true,
      overdueReminderEveryDays: true,
      clientPhone: true,
    };
    let invoices;
    try {
      invoices = withItems
        ? await prisma.invoice.findMany({
          where: { ownerUserId: userId },
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
          orderBy: usePagination ? { id: "desc" } : { date: "desc" },
          ...(usePagination
            ? {
              take: limit + 1,
              ...(cursor && Number.isInteger(cursor) ? { cursor: { id: cursor }, skip: 1 } : {}),
            }
            : {}),
        })
        : await prisma.invoice.findMany({
          where: { ownerUserId: userId },
          select: baseSelect,
          orderBy: usePagination ? { id: "desc" } : { date: "desc" },
          ...(usePagination
            ? {
              take: limit + 1,
              ...(cursor && Number.isInteger(cursor) ? { cursor: { id: cursor }, skip: 1 } : {}),
            }
            : {}),
        });
    } catch (error) {
      if (!isReminderSchemaMismatch(error)) throw error;

      const legacySelect = {
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

      invoices = withItems
        ? await prisma.invoice.findMany({
          where: { userId },
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
          orderBy: usePagination ? { id: "desc" } : { date: "desc" },
          ...(usePagination
            ? {
              take: limit + 1,
              ...(cursor && Number.isInteger(cursor) ? { cursor: { id: cursor }, skip: 1 } : {}),
            }
            : {}),
        })
        : await prisma.invoice.findMany({
          where: { userId },
          select: legacySelect,
          orderBy: usePagination ? { id: "desc" } : { date: "desc" },
          ...(usePagination
            ? {
              take: limit + 1,
              ...(cursor && Number.isInteger(cursor) ? { cursor: { id: cursor }, skip: 1 } : {}),
            }
            : {}),
        });
    }

    if (usePagination) {
      const hasMore = invoices.length > limit;
      const data = hasMore ? invoices.slice(0, limit) : invoices;
      const nextCursor = hasMore ? data[data.length - 1]?.id : null;
      return NextResponse.json({ data, hasMore, nextCursor });
    }

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
    // session already fetched above
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
      autoReminderEnabled,
      reminderOffsets,
      overdueReminderEnabled,
      overdueReminderEveryDays,
      reminderChannel,
    } = data;

    if (!clientName || !date || !items || items.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: clientName, date, and at least one item" },
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
      reminderChannel: data.reminderChannel,
      overdueReminderEnabled: data.overdueReminderEnabled,
      overdueReminderEveryDays: data.overdueReminderEveryDays,
      dueDate: dueDate ? new Date(dueDate) : null,
    });

    const commonCreateData = {
      senderName: senderName || "",
      senderEmail: senderEmail || "",
      senderAddress: senderAddress || "",
      clientName,
      clientEmail: clientEmail || "",
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

    let invoice;
    try {
      invoice = await prisma.invoice.create({
        data: {
          ...commonCreateData,
          ownerUserId: session.user.id,
          // Reminder Settings
          autoReminderEnabled: reminderSettings.autoReminderEnabled,
          reminderOffsets: reminderSettings.reminderOffsets,
          reminderChannel: reminderSettings.reminderChannel,
          overdueReminderEnabled: reminderSettings.overdueReminderEnabled,
          overdueReminderEveryDays: reminderSettings.overdueReminderEveryDays,
          clientPhone: clientPhone || "",
        },
        include: { items: true },
      });
    } catch (error) {
      if (isInvoiceNumberUniqueViolation(error)) {
        return NextResponse.json(
          { error: "Invoice number already exists for your account" },
          { status: 409 }
        );
      }
      if (!isReminderSchemaMismatch(error)) throw error;

      try {
        invoice = await prisma.invoice.create({
          data: {
            ...commonCreateData,
            userId: session.user.id,
          },
          include: { items: true },
        });
      } catch (legacyError) {
        if (isInvoiceNumberUniqueViolation(legacyError)) {
          return NextResponse.json(
            { error: "Invoice number already exists for your account" },
            { status: 409 }
          );
        }
        throw legacyError;
      }
    }

    // Immediate reminder check
    if (invoice.autoReminderEnabled && invoice.dueDate && invoice.status !== "Paid") {
      const { getReminderMatchForDate } = await import("@/lib/reminders");
      const { sendInvoiceReminderById } = await import("@/lib/mail-service");

      const match = getReminderMatchForDate({
        dueDate: invoice.dueDate,
        reminderOffsets: (invoice.reminderOffsets as number[]) || [],
        overdueReminderEnabled: invoice.overdueReminderEnabled,
        overdueReminderEveryDays: invoice.overdueReminderEveryDays,
      });

      if (match) {
        // We don't await this to keep the response fast, or we could if reliability is key.
        // Given the user request, let's await it so THEY see if it works.
        try {
          await sendInvoiceReminderById({
            invoiceId: invoice.id,
            reminderType: match.reminderType,
            daysUntilDue: match.daysUntilDue,
            daysOverdue: match.daysOverdue,
          });

          // Log it so sweep doesn't resend
          try {
            await prisma.invoiceReminderLog.create({
              data: {
                invoiceId: invoice.id,
                reminderKey: match.reminderKey,
                reminderType: match.reminderType,
                targetDate: match.targetDate,
              },
            });
          } catch (e) {
            if (!isReminderLogDuplicateError(e)) {
              throw e;
            }
          }
        } catch (e) {
          console.error("Failed to send immediate invoice reminder:", e);
        }
      }
    }

    // Auto-track firstInvoiceAt on the linked Customer record (used for VIP/long-term detection)
    if (invoice.customerId) {
      await prisma.customer.updateMany({
        where: {
          id: invoice.customerId,
          firstInvoiceAt: null, // Only set if not already set
        },
        data: {
          firstInvoiceAt: new Date(date),
        },
      });
    }

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error("Failed to create invoice:", error);
    return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
  }
}

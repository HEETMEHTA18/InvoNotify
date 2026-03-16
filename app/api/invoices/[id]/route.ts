

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeReminderChannel, normalizeReminderSettings } from "@/lib/reminders";
import { auth } from "@/lib/auth";

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

// GET: Get a single invoice with items
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // User isolation: Only allow access to invoices owned by the user
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const invoice = await prisma.invoice.findUnique({
      where: { id: Number(id), ownerUserId: userId },
      include: { items: true },
    });
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(invoice);
  } catch (error) {
    console.error("Failed to fetch invoice:", error);
    return NextResponse.json({ error: "Failed to fetch invoice" }, { status: 500 });
  }
}

// PUT: Update an invoice (using PUT as it replaces the resource conceptually if we replace items)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await req.json();
    const { items, ...invoiceData } = data;
    const invoiceId = Number(id);
    let reminderFieldsSupported = true;

    // User isolation: Only allow access to invoices owned by the user
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const existingBase = await prisma.invoice.findUnique({
      where: { id: invoiceId, ownerUserId: userId },
      select: { amountPaid: true, dueDate: true },
    });
    if (!existingBase) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    let existingReminder: {
      ownerUserId: string | null;
      clientPhone: string;
      autoReminderEnabled: boolean;
      reminderOffsets: number[];
      reminderChannel: string;
      overdueReminderEnabled: boolean;
      overdueReminderEveryDays: number;
    } | null = null;

    try {
      // User isolation: Only allow access to invoices owned by the user
      const session = await auth();
      if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      existingReminder = await prisma.invoice.findUnique({
        where: { id: invoiceId, ownerUserId: session.user.id },
        select: {
          ownerUserId: true,
          clientPhone: true,
          autoReminderEnabled: true,
          reminderOffsets: true,
          reminderChannel: true,
          overdueReminderEnabled: true,
          overdueReminderEveryDays: true,
        },
      });
    } catch (error) {
      if (!isReminderSchemaMismatch(error)) throw error;
      reminderFieldsSupported = false;
    }

    // Update invoice and optionally replace items
    const updateData: any = {
      ...invoiceData,
      template: invoiceData.template || undefined,
      date: invoiceData.date ? new Date(invoiceData.date) : undefined,
      dueDate:
        invoiceData.dueDate === ""
          ? null
          : invoiceData.dueDate
            ? new Date(invoiceData.dueDate)
            : undefined,
      clientPhone: invoiceData.clientPhone !== undefined ? String(invoiceData.clientPhone || "") : undefined,
    };

    // Calculate tax breakdown matching the POST logic
    if (updateData.subtotal !== undefined && updateData.taxRate !== undefined) {
      const subtotal = Number(updateData.subtotal);
      const discount = Number(updateData.discount) || 0;
      const taxRate = Number(updateData.taxRate);
      const gstType = updateData.gstType || "INTRA";

      const taxableAmount = Math.max(0, subtotal - discount);
      const totalTax = (taxableAmount * taxRate) / 100;

      updateData.tax = totalTax;
      if (gstType === "INTRA") {
        updateData.cgst = totalTax / 2;
        updateData.sgst = totalTax / 2;
        updateData.igst = 0;
      } else {
        updateData.igst = totalTax;
        updateData.cgst = 0;
        updateData.sgst = 0;
      }
      updateData.total = taxableAmount + totalTax;
      updateData.amount = updateData.total; // Legacy field

      // Recalculate balance based on existing amountPaid
      const amountPaid = Number(existingBase.amountPaid || 0);
      updateData.amountPaid = amountPaid;
      updateData.balance = Number(updateData.total) - amountPaid;
    }

    if (
      reminderFieldsSupported &&
      (
        invoiceData.autoReminderEnabled !== undefined ||
        invoiceData.reminderOffsets !== undefined ||
        invoiceData.reminderChannel !== undefined ||
        invoiceData.overdueReminderEnabled !== undefined ||
        invoiceData.overdueReminderEveryDays !== undefined ||
        invoiceData.dueDate !== undefined
      )
    ) {
      const effectiveDueDate =
        updateData.dueDate !== undefined ? updateData.dueDate : existingBase.dueDate;
      const reminderSettings = normalizeReminderSettings({
        autoReminderEnabled: invoiceData.autoReminderEnabled ?? existingReminder?.autoReminderEnabled,
        reminderOffsets: invoiceData.reminderOffsets ?? existingReminder?.reminderOffsets,
        reminderChannel: invoiceData.reminderChannel ?? existingReminder?.reminderChannel,
        overdueReminderEnabled:
          invoiceData.overdueReminderEnabled ?? existingReminder?.overdueReminderEnabled,
        overdueReminderEveryDays:
          invoiceData.overdueReminderEveryDays ?? existingReminder?.overdueReminderEveryDays,
        dueDate: effectiveDueDate,
      });

      updateData.autoReminderEnabled = reminderSettings.autoReminderEnabled;
      updateData.reminderOffsets = reminderSettings.reminderOffsets;
      updateData.reminderChannel = reminderSettings.reminderChannel;
      updateData.overdueReminderEnabled = reminderSettings.overdueReminderEnabled;
      updateData.overdueReminderEveryDays = reminderSettings.overdueReminderEveryDays;
      updateData.ownerUserId = existingReminder?.ownerUserId || undefined;

      const effectiveChannel = normalizeReminderChannel(
        invoiceData.reminderChannel ?? existingReminder?.reminderChannel
      );
      const effectivePhone =
        updateData.clientPhone !== undefined ? updateData.clientPhone : existingReminder?.clientPhone || "";
      if (effectiveChannel !== "EMAIL" && !String(effectivePhone || "").trim()) {
        return NextResponse.json(
          { error: "Client phone is required for SMS or Both reminder channel" },
          { status: 400 }
        );
      }
    }

    if (reminderFieldsSupported) {
      const effectiveChannel = normalizeReminderChannel(
        invoiceData.reminderChannel ?? existingReminder?.reminderChannel
      );
      const effectivePhone =
        updateData.clientPhone !== undefined ? updateData.clientPhone : existingReminder?.clientPhone || "";

      if (effectiveChannel !== "EMAIL" && !String(effectivePhone || "").trim()) {
        return NextResponse.json(
          { error: "Client phone is required for SMS or Both reminder channel" },
          { status: 400 }
        );
      }
    }

    if (items) {
      // Transactional update would be better, but simple approach for now
      // Delete existing items and create new ones
      await prisma.invoiceItem.deleteMany({ where: { invoiceId } });
      updateData.items = {
        create: items.map(
          (item: { description: string; hsnCode?: string; quantity: number | string; rate: number | string; amount: number | string }) => ({
            description: item.description,
            hsnCode: item.hsnCode || null,
            quantity: Number(item.quantity),
            rate: Number(item.rate),
            amount: Number(item.amount),
          })
        ),
      };
    }

    let invoice;
    try {
      invoice = await prisma.invoice.update({
        where: { id: invoiceId },
        data: updateData as any,
        include: { items: true },
      });
    } catch (error) {
      if (!isReminderSchemaMismatch(error)) throw error;

      const fallbackData = { ...updateData };
      delete fallbackData.autoReminderEnabled;
      delete fallbackData.reminderOffsets;
      delete fallbackData.reminderChannel;
      delete fallbackData.overdueReminderEnabled;
      delete fallbackData.overdueReminderEveryDays;
      delete fallbackData.ownerUserId;
      delete fallbackData.clientPhone;

      invoice = await prisma.invoice.update({
        where: { id: invoiceId },
        data: fallbackData,
        include: { items: true },
      });
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
        // Check if already sent for this specific reminder key
        const alreadySent = await prisma.invoiceReminderLog.findUnique({
          where: {
            invoiceId_reminderKey: {
              invoiceId: invoice.id,
              reminderKey: match.reminderKey,
            },
          },
        });

        if (!alreadySent) {
          try {
            await sendInvoiceReminderById({
              invoiceId: invoice.id,
              reminderType: match.reminderType,
              daysUntilDue: match.daysUntilDue,
              daysOverdue: match.daysOverdue,
            });

            await prisma.invoiceReminderLog.create({
              data: {
                invoiceId: invoice.id,
                reminderKey: match.reminderKey,
                reminderType: match.reminderType,
                targetDate: match.targetDate,
              },
            });
          } catch (e) {
            console.error("Failed to send immediate invoice reminder on update:", e);
          }
        }
      }
    }

    return NextResponse.json(invoice);
  } catch (error) {
    console.error("Failed to update invoice:", error);
    return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 });
  }
}

// DELETE: Delete an invoice
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    // Ensure the invoice belongs to the user before deleting
    const existing = await prisma.invoice.findUnique({
      where: { id: Number(id), ownerUserId: userId }
    });

    if (!existing) {
      return NextResponse.json({ error: "Invoice not found or unauthorized" }, { status: 404 });
    }

    await prisma.invoice.delete({ where: { id: Number(id) } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete invoice:", error);
    return NextResponse.json({ error: "Failed to delete invoice" }, { status: 500 });
  }
}

// PATCH: Partial update (e.g., status)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const data = await req.json();

    const invoice = await prisma.invoice.update({
      where: { id: Number(id), ownerUserId: userId },
      data: data,
    });
    return NextResponse.json(invoice);
  } catch (error) {
    console.error("Failed to update invoice:", error);
    return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 });
  }
}

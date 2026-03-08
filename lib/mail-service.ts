import { prisma } from "@/lib/db";
import { sendInvoiceReminder } from "@/lib/gmail";
import { generateInvoicePDFBuffer } from "@/lib/pdf";
import { getInvoiceReminderTemplate } from "@/lib/templates";
import { sendSMS } from "@/lib/sms";
import { sendTelegramMessage } from "@/lib/telegram";
import {
  ReminderChannel,
  ReminderType,
  getReminderSubject,
  normalizeReminderChannel,
} from "@/lib/reminders";

type SendReminderParams = {
  invoiceId: number;
  reminderType: ReminderType;
  daysUntilDue?: number;
  daysOverdue?: number;
  fallbackUserId?: string | null;
  channelOverride?: ReminderChannel;
};

type ReminderResult =
  | { sent: true; invoiceId: number; channels: ReminderChannel[] }
  | { sent: false; invoiceId: number; reason: string };

function getReminderTone(reminderType: ReminderType) {
  if (reminderType === "BEFORE_DUE") return { title: "Upcoming Due Reminder", badge: "UPCOMING" };
  if (reminderType === "DUE_DATE") return { title: "Payment Due Today", badge: "DUE TODAY" };
  if (reminderType === "OVERDUE_REPEAT") return { title: "Overdue Payment Reminder", badge: "OVERDUE" };
  return { title: "Payment Reminder", badge: "REMINDER" };
}

export async function sendInvoiceReminderById(params: SendReminderParams): Promise<ReminderResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.invoiceId },
    include: { items: true },
  });

  if (!invoice) return { sent: false, invoiceId: params.invoiceId, reason: "Invoice not found" };
  if (invoice.status === "Paid" || Number(invoice.balance) <= 0) {
    return { sent: false, invoiceId: invoice.id, reason: "Invoice already paid" };
  }

  const reminderChannel = params.channelOverride ?? normalizeReminderChannel(invoice.reminderChannel);
  const useEmail = reminderChannel === "EMAIL" || reminderChannel === "BOTH";
  const useSms = reminderChannel === "SMS" || reminderChannel === "BOTH";

  if (useEmail && !invoice.clientEmail) {
    return { sent: false, invoiceId: invoice.id, reason: "Client email missing" };
  }
  if (useSms && !String(invoice.clientPhone || "").trim()) {
    return { sent: false, invoiceId: invoice.id, reason: "Client phone missing" };
  }

  const actingUserId = invoice.ownerUserId || params.fallbackUserId || null;
  const companySettings = actingUserId
    ? await prisma.companySettings.findUnique({ where: { userId: actingUserId } })
    : null;

  const formattedInvoice = {
    ...invoice,
    date: invoice.date.toISOString(),
    dueDate: invoice.dueDate?.toISOString() || null,
    subtotal: invoice.subtotal.toString(),
    total: invoice.total.toString(),
    amount: invoice.total.toString(),
    items: invoice.items.map((item) => ({
      ...item,
      rate: item.rate.toString(),
      amount: item.amount.toString(),
    })),
  };

  const pdfBuffer = generateInvoicePDFBuffer(
    formattedInvoice as unknown as Parameters<typeof generateInvoicePDFBuffer>[0],
    companySettings || undefined
  );

  const subject = getReminderSubject({
    invoiceNumber: invoice.invoiceNumber,
    reminderType: params.reminderType,
    daysUntilDue: params.daysUntilDue ?? 0,
    daysOverdue: params.daysOverdue ?? 0,
  });

  const tone = getReminderTone(params.reminderType);
  const body = getInvoiceReminderTemplate({
    clientName: invoice.clientName || "Valued Customer",
    invoiceNumber: invoice.invoiceNumber,
    amountDue: Number(invoice.balance).toLocaleString(),
    dueDate: invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "N/A",
    senderName: invoice.senderName || "Invoice Management",
    senderAddress: invoice.senderAddress || "",
    logoUrl: companySettings?.logo || null,
    currency: invoice.currency,
    reminderTitle: tone.title,
    reminderBadge: tone.badge,
    isOverdue: params.reminderType === "OVERDUE_REPEAT",
  });

  const attachmentName = `invoice-${invoice.invoiceNumber || invoice.id}.pdf`;
  const channelsSent: ReminderChannel[] = [];

  if (useEmail && invoice.clientEmail) {
    if (!actingUserId) {
      return { sent: false, invoiceId: invoice.id, reason: "Owner not assigned, cannot send via Gmail API" };
    }

    try {
      await sendInvoiceReminder({
        userId: actingUserId,
        to: invoice.clientEmail,
        subject,
        body,
        attachment: pdfBuffer,
        attachmentName,
      });
      channelsSent.push("EMAIL");
    } catch (error) {
      console.error("Gmail API send failed:", error instanceof Error ? error.message : error);
      return { sent: false, invoiceId: invoice.id, reason: `Gmail API Error: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  }

  if (useSms && invoice.clientPhone) {
    const dueDateLabel = invoice.dueDate
      ? new Date(invoice.dueDate).toLocaleDateString()
      : new Date(invoice.date).toLocaleDateString();
    const smsMessage =
      `${subject}. Invoice #${invoice.invoiceNumber} ` +
      `Balance: ${invoice.currency} ${Number(invoice.balance).toFixed(2)}. ` +
      `Due: ${dueDateLabel}. From: ${invoice.senderName || "Invoice Management"}.`;

    try {
      await sendSMS(invoice.clientPhone, smsMessage);
      channelsSent.push("SMS");
    } catch (error) {
      console.error("SMS send failed:", error);
      if (channelsSent.length === 0) {
        return { sent: false, invoiceId: invoice.id, reason: "SMS send failed" };
      }
    }
  }

  // Bonus: If Telegram is configured, send a mirror notification there too
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    try {
      const tgMessage = `<b>Reminder Sent</b>\n` +
        `Invoice: #${invoice.invoiceNumber}\n` +
        `Client: ${invoice.clientName}\n` +
        `Amount: ${invoice.currency} ${Number(invoice.balance).toFixed(2)}\n` +
        `Type: ${params.reminderType}`;
      await sendTelegramMessage(tgMessage);
    } catch (e) {
      console.warn("Telegram mirror notification failed", e);
    }
  }

  if (channelsSent.length === 0) {
    return { sent: false, invoiceId: invoice.id, reason: "No reminder channel sent successfully" };
  }

  return { sent: true, invoiceId: invoice.id, channels: channelsSent };
}

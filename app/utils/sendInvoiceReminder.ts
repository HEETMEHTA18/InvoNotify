import nodemailer from "nodemailer";
import { prisma } from "@/app/utils/db";
import { sendInvoiceReminder } from "@/app/utils/gmail";
import { generateInvoicePDFBuffer } from "@/app/utils/pdfGenerator";
import { getInvoiceReminderTemplate } from "@/app/utils/emailTemplates";
import { sendSMS } from "@/lib/sms";
import {
  ReminderChannel,
  ReminderType,
  getReminderSubject,
  normalizeReminderChannel,
} from "@/app/utils/invoiceReminders";

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

async function sendViaNodemailer(args: {
  to: string;
  subject: string;
  html: string;
  pdfBuffer: Uint8Array;
  attachmentName: string;
  senderName: string;
}) {
  let transport;

  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    transport = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  } else if (process.env.MAILTRAP_TOKEN) {
    transport = nodemailer.createTransport({
      host: "send.smtp.mailtrap.io",
      port: 587,
      auth: {
        user: "api",
        pass: process.env.MAILTRAP_TOKEN,
      },
    });
  } else {
    throw new Error("No email transport configured");
  }

  await transport.sendMail({
    from: {
      address: process.env.GMAIL_USER || process.env.EMAIL_FROM || "hello@example.com",
      name: args.senderName,
    },
    to: args.to,
    subject: args.subject,
    html: args.html,
    attachments: [
      {
        filename: args.attachmentName,
        content: Buffer.from(args.pdfBuffer),
        contentType: "application/pdf",
      },
    ],
  });
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
  });

  const attachmentName = `invoice-${invoice.invoiceNumber || invoice.id}.pdf`;
  const channelsSent: ReminderChannel[] = [];

  if (useEmail && invoice.clientEmail) {
    if (actingUserId) {
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
        console.warn("Gmail API send failed, falling back to SMTP:", error);
      }
    }

    if (!channelsSent.includes("EMAIL")) {
      await sendViaNodemailer({
        to: invoice.clientEmail,
        subject,
        html: body,
        pdfBuffer,
        attachmentName,
        senderName: invoice.senderName || "Invoice Management",
      });
      channelsSent.push("EMAIL");
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

    await sendSMS(invoice.clientPhone, smsMessage);
    channelsSent.push("SMS");
  }

  if (channelsSent.length === 0) {
    return { sent: false, invoiceId: invoice.id, reason: "No reminder channel sent" };
  }

  return { sent: true, invoiceId: invoice.id, channels: channelsSent };
}

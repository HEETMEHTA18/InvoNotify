import { prisma } from "@/lib/db";
import { sendInvoiceReminder } from "@/lib/gmail";
import { generateInvoicePDFBuffer } from "@/lib/pdf";
import { getInvoiceReminderTemplate } from "@/lib/templates";
import { sendTelegramMessage } from "@/lib/telegram";
import QRCode from "qrcode";
import { buildPaymentPayload, isValidPaymentPayload } from "@/lib/payment-qr";
import { getFallbackQrPayloadFromCodebase } from "@/lib/bank-qr-fallback";
import { createPaymentLink, fetchPaymentLink } from "@/lib/razorpay";
import { isWhatsAppConfigured, sendWhatsAppPaymentReminder } from "@/lib/whatsapp";
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
  const useEmail = reminderChannel === "EMAIL" || reminderChannel === "BOTH" || reminderChannel === "EMAIL_WHATSAPP";
  const useWhatsApp = (reminderChannel === "WHATSAPP" || reminderChannel === "BOTH" || reminderChannel === "EMAIL_WHATSAPP") && isWhatsAppConfigured();
  const whatsappNumber = invoice.clientPhone || null;

  if (useEmail && !invoice.clientEmail) {
    return { sent: false, invoiceId: invoice.id, reason: "Client email missing" };
  }
  if (useWhatsApp && !whatsappNumber) {
    // Fall back to email only if no phone number
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

  const pdfBuffer = await generateInvoicePDFBuffer(
    formattedInvoice as unknown as Parameters<typeof generateInvoicePDFBuffer>[0],
    companySettings || undefined
  );

  const subject = getReminderSubject({
    customerName: invoice.clientName || invoice.customer || "Customer",
    reminderType: params.reminderType,
    daysUntilDue: params.daysUntilDue ?? 0,
    daysOverdue: params.daysOverdue ?? 0,
  });

  const tone = getReminderTone(params.reminderType);
  const normalizedAmount = Math.max(0, Number(invoice.balance)).toFixed(2);
  const basePaymentPayload = isValidPaymentPayload(companySettings?.paymentQrPayload)
    ? companySettings!.paymentQrPayload!.trim()
    : await getFallbackQrPayloadFromCodebase();
  const effectivePaymentPayload = basePaymentPayload
    ? buildPaymentPayload(basePaymentPayload, normalizedAmount, invoice.invoiceNumber)
    : "";

  let paymentQrDataUrl: string | null = null;
  if (effectivePaymentPayload) {
    try {
      paymentQrDataUrl = await QRCode.toDataURL(effectivePaymentPayload, {
        width: 220,
        margin: 1,
        errorCorrectionLevel: "M",
      });
    } catch {
      paymentQrDataUrl = null;
    }
  }

  let body = getInvoiceReminderTemplate({
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
    paymentQrDataUrl,
    paymentQrAmount: normalizedAmount,
    checkoutUrl: null,
  });

  const attachmentName = `invoice-${invoice.invoiceNumber || invoice.id}.pdf`;
  const channelsSent: ReminderChannel[] = [];

  if (useEmail && invoice.clientEmail) {
    if (!actingUserId) {
      return { sent: false, invoiceId: invoice.id, reason: "Owner not assigned, cannot send via Gmail API" };
    }

    try {
      const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      let checkoutUrl: string | null = null;

      if (invoice.razorpayPaymentLinkUrl) {
        checkoutUrl = invoice.razorpayPaymentLinkUrl;
      } else if (invoice.razorpayPaymentLinkId) {
        // Payment link exists but URL is missing — fetch it from Razorpay
        try {
          const existingLink = await fetchPaymentLink(invoice.razorpayPaymentLinkId);
          if (existingLink.short_url) {
            checkoutUrl = existingLink.short_url;
            // Cache the URL back to the invoice for future emails
            await prisma.invoice.update({
              where: { id: invoice.id },
              data: { razorpayPaymentLinkUrl: existingLink.short_url },
            });
          }
        } catch (fetchError) {
          console.error("Failed to fetch existing Razorpay payment link:", fetchError);
          // Fall through to create a new link
        }
      }

      // Create a new payment link if we still don't have one
      if (!checkoutUrl) {
        try {
          const link = await createPaymentLink({
            amount: Math.round(Number(invoice.balance)),
            currency: invoice.currency || "INR",
            description: `Payment for Invoice ${invoice.invoiceNumber || `#${invoice.id}`}`,
            customer: {
              name: invoice.clientName || undefined,
              email: invoice.clientEmail || undefined,
              contact: invoice.clientPhone || undefined,
            },
            notify: { email: false, sms: false, whatsapp: false },
            reference_id: String(invoice.id),
            callback_url: `${appUrl}/api/webhooks/razorpay`,
            callback_method: "get",
          });
          checkoutUrl = link.short_url || null;

          await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              razorpayPaymentLinkId: link.id,
              razorpayPaymentLinkUrl: link.short_url || null,
            },
          });
        } catch (linkError) {
          console.error("Failed to create Razorpay payment link for reminder:", linkError);
        }
      }

      if (checkoutUrl) {
        body = getInvoiceReminderTemplate({
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
          paymentQrDataUrl,
          paymentQrAmount: normalizedAmount,
          checkoutUrl,
        });
      }

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

  // WhatsApp channel
  if (useWhatsApp && whatsappNumber) {
    try {
      const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      let checkoutUrl: string | null = invoice.razorpayPaymentLinkUrl || null;

      if (!checkoutUrl && !invoice.razorpayPaymentLinkId) {
        try {
          const link = await createPaymentLink({
            amount: Math.round(Number(invoice.balance)),
            currency: invoice.currency || "INR",
            description: `Payment for Invoice ${invoice.invoiceNumber || `#${invoice.id}`}`,
            customer: {
              name: invoice.clientName || undefined,
              email: invoice.clientEmail || undefined,
              contact: whatsappNumber || undefined,
            },
            notify: { email: false, sms: false, whatsapp: false },
            reference_id: String(invoice.id),
            callback_url: `${appUrl}/api/webhooks/razorpay`,
            callback_method: "get",
          });
          checkoutUrl = link.short_url || null;

          await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              razorpayPaymentLinkId: link.id,
              razorpayPaymentLinkUrl: link.short_url || null,
            },
          });
        } catch (linkError) {
          console.error("Failed to create Razorpay payment link for WhatsApp:", linkError);
        }
      }

      const waResult = await sendWhatsAppPaymentReminder({
        to: whatsappNumber,
        customerName: invoice.clientName || invoice.customer || "Customer",
        invoiceNumber: invoice.invoiceNumber || String(invoice.id),
        amountDue: Number(invoice.balance).toLocaleString(),
        currency: invoice.currency || "INR",
        dueDate: invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : null,
        paymentLinkUrl: checkoutUrl,
        daysOverdue: params.daysOverdue ?? 0,
        senderName: invoice.senderName || "InvoNotify",
      });

      if (waResult.ok) {
        channelsSent.push("WHATSAPP");
      } else {
        console.error("WhatsApp send failed:", waResult.error);
      }
    } catch (error) {
      console.error("WhatsApp channel error:", error instanceof Error ? error.message : error);
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

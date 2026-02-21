
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/utils/auth";
import { prisma } from "@/app/utils/db";
import { sendInvoiceReminder } from "@/app/utils/gmail";
import { generateInvoicePDFBuffer } from "@/app/utils/pdfGenerator";
import nodemailer from "nodemailer";

// Fallback: send email via Nodemailer (Mailtrap or Gmail SMTP)
async function sendViaNodemailer({
  to, subject, html, pdfBuffer, attachmentName, senderName,
}: {
  to: string; subject: string; html: string;
  pdfBuffer?: Uint8Array; attachmentName: string; senderName: string;
}) {
  let transport;
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    transport = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
  } else if (process.env.MAILTRAP_TOKEN) {
    transport = nodemailer.createTransport({
      host: "send.smtp.mailtrap.io",
      port: 587,
      auth: { user: "api", pass: process.env.MAILTRAP_TOKEN },
    });
  } else {
    throw new Error("No email transport configured. Set GMAIL_USER/GMAIL_APP_PASSWORD or MAILTRAP_TOKEN in .env");
  }

  const mailOptions: any = {
    from: { address: process.env.GMAIL_USER || process.env.EMAIL_FROM || "hello@example.com", name: senderName },
    to, subject, html,
  };
  if (pdfBuffer) {
    mailOptions.attachments = [{
      filename: attachmentName,
      content: Buffer.from(pdfBuffer),
      contentType: "application/pdf",
    }];
  }
  await transport.sendMail(mailOptions);
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let invoiceId: string | number;
    try {
      const body = await req.json();
      invoiceId = body.invoiceId;
    } catch {
      return NextResponse.json({ error: "Invalid or empty request body" }, { status: 400 });
    }
    if (!invoiceId) {
      return NextResponse.json({ error: "Invoice ID is required" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: Number(invoiceId) },
      include: { items: true },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (!invoice.clientEmail) {
      return NextResponse.json({ error: "Client email is missing for this invoice" }, { status: 400 });
    }

    const companySettings = await prisma.companySettings.findUnique({
      where: { userId: session.user.id },
    });

    const formattedInvoice = {
      ...invoice,
      date: invoice.date.toISOString(),
      dueDate: invoice.dueDate?.toISOString() || null,
      subtotal: invoice.subtotal.toString(),
      total: invoice.total.toString(),
      amount: invoice.total.toString(),
      items: invoice.items.map(item => ({
        ...item,
        rate: item.rate.toString(),
        amount: item.amount.toString(),
      })),
    };

    const pdfBuffer = generateInvoicePDFBuffer(formattedInvoice as any, companySettings || undefined);

    const subject = `Invoice #${invoice.invoiceNumber} from ${invoice.senderName || 'our company'}`;
    const { getInvoiceReminderTemplate } = await import("@/app/utils/emailTemplates");
    const body = getInvoiceReminderTemplate({
      clientName: invoice.clientName || 'Valued Customer',
      invoiceNumber: invoice.invoiceNumber,
      amountDue: Number(invoice.balance).toLocaleString(),
      dueDate: invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A',
      senderName: invoice.senderName || 'Shiv Hardware',
      senderAddress: invoice.senderAddress || 'Shiv Hardware, Nadiad',
      logoUrl: companySettings?.logo,
      currency: invoice.currency
    });

    // Try Gmail API first, then fall back to Nodemailer
    try {
      await sendInvoiceReminder({
        userId: session.user.id,
        to: invoice.clientEmail,
        subject,
        body,
        attachment: pdfBuffer,
        attachmentName: `invoice-${invoice.invoiceNumber}.pdf`,
      });
    } catch (gmailErr: any) {
      console.warn("Gmail API failed, falling back to Nodemailer:", gmailErr.message);
      await sendViaNodemailer({
        to: invoice.clientEmail,
        subject,
        html: body,
        pdfBuffer,
        attachmentName: `invoice-${invoice.invoiceNumber}.pdf`,
        senderName: invoice.senderName || 'Shiv Hardware',
      });
    }

    return NextResponse.json({ success: true, message: "Invoice sent successfully" });
  } catch (error: any) {
    console.error("Failed to send invoice:", error);
    return NextResponse.json({ error: error.message || "Failed to send invoice" }, { status: 500 });
  }
}


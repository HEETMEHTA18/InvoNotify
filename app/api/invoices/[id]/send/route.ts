import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/utils/db";
import { auth } from "@/app/utils/auth";
import nodemailer from "nodemailer";

// POST: Send invoice PDF to client email
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { pdfBase64 } = await req.json();

    if (!pdfBase64) {
      return NextResponse.json({ error: "PDF data is required" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: Number(id) },
      include: { items: true },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (!invoice.clientEmail) {
      return NextResponse.json({ error: "Client email is missing" }, { status: 400 });
    }

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
      return NextResponse.json({ error: "No email credentials configured" }, { status: 500 });
    }

    // Convert base64 to buffer for attachment
    const pdfBuffer = Buffer.from(pdfBase64, "base64");

    const result = await transport.sendMail({
      from: {
        address: process.env.GMAIL_USER || (process.env.EMAIL_FROM || "hello@example.com"),
        name: invoice.senderName || "Invoice Management",
      },
      to: invoice.clientEmail,
      subject: `Invoice ${invoice.invoiceNumber} from ${invoice.senderName || "Invoice Management"}`,
      text: `Dear ${invoice.clientName},\n\nPlease find attached your invoice ${invoice.invoiceNumber}.\n\nTotal Amount: $${Number(invoice.total).toFixed(2)}\nDue Date: ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "N/A"}\n\nThank you for your business!\n\nBest regards,\n${invoice.senderName || "Invoice Management"}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
          <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 32px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Invoice</h1>
            <p style="color: #a0aec0; margin: 8px 0 0 0; font-size: 14px;">${invoice.invoiceNumber}</p>
          </div>
          <div style="padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
            <p style="font-size: 16px; color: #2d3748; margin-top: 0;">Dear ${invoice.clientName},</p>
            <p style="font-size: 14px; color: #4a5568; line-height: 1.6;">Please find attached your invoice. Below is a summary:</p>
            <div style="background: #f7fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #718096; font-size: 14px;">Invoice Number</td>
                  <td style="padding: 8px 0; color: #2d3748; font-size: 14px; text-align: right; font-weight: 600;">${invoice.invoiceNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #718096; font-size: 14px;">Total Amount</td>
                  <td style="padding: 8px 0; color: #2d3748; font-size: 14px; text-align: right; font-weight: 600;">$${Number(invoice.total).toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #718096; font-size: 14px;">Due Date</td>
                  <td style="padding: 8px 0; color: #2d3748; font-size: 14px; text-align: right; font-weight: 600;">${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "N/A"}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #718096; font-size: 14px;">Status</td>
                  <td style="padding: 8px 0; font-size: 14px; text-align: right;">
                    <span style="background: ${invoice.status === "Paid" ? "#c6f6d5" : "#fefcbf"}; color: ${invoice.status === "Paid" ? "#276749" : "#975a16"}; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;">${invoice.status}</span>
                  </td>
                </tr>
              </table>
            </div>
            <p style="font-size: 14px; color: #4a5568; line-height: 1.6;">Thank you for your business!</p>
            <p style="font-size: 14px; color: #4a5568; margin-bottom: 0;">Best regards,<br/><strong>${invoice.senderName || "Invoice Management"}</strong></p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `${invoice.invoiceNumber || "invoice"}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    if (result.rejected?.length) {
      throw new Error(`Email delivery failed: ${result.rejected.join(", ")}`);
    }

    return NextResponse.json({ message: `Invoice sent to ${invoice.clientEmail}` });
  } catch (error) {
    console.error("Failed to send invoice:", error);
    return NextResponse.json({ error: "Failed to send invoice email" }, { status: 500 });
  }
}

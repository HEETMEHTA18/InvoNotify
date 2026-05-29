import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { sendInvoiceReminder } from "@/lib/gmail";
import { createStripeCheckoutUrl } from "@/lib/stripe";

// POST: Send invoice PDF to client email
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { pdfBase64, htmlContent, subject: customSubject } = await req.json();

    if (!pdfBase64) {
      return NextResponse.json({ error: "PDF data is required" }, { status: 400 });
    }

    // User isolation: Only allow access to invoices owned by the user
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: Number(id),
        OR: [{ ownerUserId: session.user.id }, { userId: session.user.id }],
      },
      include: { items: true },
    });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (!invoice.clientEmail) {
      return NextResponse.json({ error: "Client email is missing" }, { status: 400 });
    }

    // Convert base64 to Uint8Array for the Gmail service
    const pdfBuffer = new Uint8Array(Buffer.from(pdfBase64, "base64"));

    const subject = customSubject || `Invoice ${invoice.invoiceNumber} from ${invoice.senderName || "Invoice Management"}`;
    const checkoutUrl = await createStripeCheckoutUrl({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amountDue: Number(invoice.balance ?? invoice.total ?? 0),
      currency: invoice.currency,
      clientEmail: invoice.clientEmail,
      clientName: invoice.clientName,
      ownerUserId: session.user.id,
    });

    const baseBody = htmlContent || `
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
                  <td style="padding: 8px 0; color: #2d3748; font-size: 14px; text-align: right; font-weight: 600;">${invoice.currency} ${Number(invoice.total).toFixed(2)}</td>
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
            ${checkoutUrl ? `
            <div style="text-align:center; margin: 24px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td align="center" bgcolor="#10b981" style="border-radius: 8px;">
                    <a href="${checkoutUrl}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">Pay Now</a>
                  </td>
                </tr>
              </table>
            </div>
            ` : ""}
            <p style="font-size: 14px; color: #4a5568; line-height: 1.6;">Thank you for your business!</p>
            <p style="font-size: 14px; color: #4a5568; margin-bottom: 0;">Best regards,<br/><strong>${invoice.senderName || "Invoice Management"}</strong></p>
          </div>
        </div>
      `;

    const body = baseBody;

    await sendInvoiceReminder({
      userId: session.user.id,
      to: invoice.clientEmail,
      subject,
      body,
      attachment: pdfBuffer,
      attachmentName: `${invoice.invoiceNumber || "invoice"}.pdf`,
    });

    return NextResponse.json({ message: `Invoice sent to ${invoice.clientEmail}` });
  } catch (error) {
    console.error("Failed to send invoice:", error);
    const msg = error instanceof Error ? error.message : "Failed to send invoice email";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

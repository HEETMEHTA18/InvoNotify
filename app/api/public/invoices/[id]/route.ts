import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parsePublicInvoiceToken } from "@/lib/security/public-invoice";

export const runtime = "nodejs";

/**
 * Public, unauthenticated invoice summary for the customer pay page.
 * Exposes ONLY non-sensitive display fields — no merchant internals.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const publicToken = parsePublicInvoiceToken(id);
  if (!publicToken) {
    // Return a generic 404 so callers cannot distinguish malformed from
    // absent capabilities or use this endpoint to enumerate invoices.
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { publicToken },
      select: {
        invoiceNumber: true,
        clientName: true,
        total: true,
        amountPaid: true,
        balance: true,
        currency: true,
        status: true,
        dueDate: true,
        date: true,
        senderName: true,
        razorpayPaymentLinkUrl: true,
        ownerUserId: true,
        items: {
          select: { description: true, quantity: true, rate: true, amount: true },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    let merchantName = invoice.senderName || "Merchant";
    if (invoice.ownerUserId) {
      const settings = await prisma.companySettings.findUnique({
        where: { userId: invoice.ownerUserId },
        select: { name: true },
      });
      if (settings?.name) merchantName = settings.name;
    }

    return NextResponse.json({
      invoiceNumber: invoice.invoiceNumber || "Invoice",
      customerName: invoice.clientName,
      merchantName,
      total: Number(invoice.total),
      amountPaid: Number(invoice.amountPaid),
      amountDue: Number(invoice.balance),
      currency: invoice.currency || "INR",
      status: invoice.status,
      dueDate: invoice.dueDate,
      issuedAt: invoice.date,
      isPaid: invoice.status === "Paid" || Number(invoice.balance) <= 0,
      hasActivePaymentLink: Boolean(invoice.razorpayPaymentLinkUrl),
      items: invoice.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        rate: Number(i.rate),
        amount: Number(i.amount),
      })),
    });
  } catch (error) {
    console.error("Public invoice fetch failed:", error);
    return NextResponse.json({ error: "Failed to load invoice" }, { status: 500 });
  }
}

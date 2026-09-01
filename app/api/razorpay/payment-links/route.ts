import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { createPaymentLink, getRazorpayKeyId } from "@/lib/razorpay";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { searchParams } = new URL(req.url);
    const invoiceId = searchParams.get("invoiceId");

    const where = invoiceId
      ? { id: parseInt(invoiceId, 10), ownerUserId: userId }
      : { ownerUserId: userId, razorpayPaymentLinkId: { not: null } };

    const invoices = await prisma.invoice.findMany({
      where,
      select: {
        id: true,
        invoiceNumber: true,
        clientName: true,
        clientEmail: true,
        balance: true,
        currency: true,
        razorpayPaymentLinkId: true,
        razorpayPaymentLinkUrl: true,
        status: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ invoices });
  } catch (error) {
    console.error("Failed to list Razorpay payment links:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await req.json();
    const { invoiceId } = body;

    if (!invoiceId) {
      return NextResponse.json({ error: "invoiceId is required" }, { status: 400 });
    }

    // Verify invoice ownership
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: parseInt(invoiceId, 10),
        OR: [{ ownerUserId: userId }, { userId }],
      },
      include: { customerRel: true },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const balance = Math.max(
      0,
      Number(invoice.balance) || Number(invoice.total) - Number(invoice.amountPaid),
    );

    if (balance <= 0) {
      return NextResponse.json(
        { error: "Invoice is already fully paid" },
        { status: 400 },
      );
    }

    // Check if there's already an active payment link
    if (invoice.razorpayPaymentLinkId) {
      return NextResponse.json(
        {
          error: "Invoice already has an active payment link",
          paymentLinkId: invoice.razorpayPaymentLinkId,
          paymentLinkUrl: invoice.razorpayPaymentLinkUrl,
        },
        { status: 409 },
      );
    }

    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const paymentLink = await createPaymentLink({
      amount: balance,
      currency: invoice.currency || "INR",
      description: `Payment for Invoice ${invoice.invoiceNumber || `#${invoice.id}`}`,
      customer: {
        name: invoice.clientName || invoice.customerRel?.name || undefined,
        email: invoice.clientEmail || invoice.customerRel?.email || undefined,
        contact: invoice.clientPhone || invoice.customerRel?.phone || undefined,
      },
      notify: { email: true, sms: false, whatsapp: false },
      reference_id: String(invoice.id),
      callback_url: `${appUrl}/api/webhooks/razorpay`,
      callback_method: "post",
    });

    // Update invoice with Razorpay payment link details
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        razorpayPaymentLinkId: paymentLink.id,
        razorpayPaymentLinkUrl: paymentLink.short_url || null,
      },
    });

    return NextResponse.json({
      paymentLinkId: paymentLink.id,
      shortUrl: paymentLink.short_url,
      status: paymentLink.status,
      amount: paymentLink.amount / 100,
      currency: paymentLink.currency,
    });
  } catch (error) {
    console.error("Failed to create Razorpay payment link:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

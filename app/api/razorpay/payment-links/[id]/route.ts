import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  fetchPaymentLink,
  cancelPaymentLink,
  resendPaymentLink,
} from "@/lib/razorpay";

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await params;
    const invoiceId = parseInt(id, 10);

    if (isNaN(invoiceId)) {
      return NextResponse.json({ error: "Invalid invoice ID" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        OR: [{ ownerUserId: userId }, { userId }],
      },
      select: {
        id: true,
        invoiceNumber: true,
        razorpayPaymentLinkId: true,
        razorpayPaymentLinkUrl: true,
        balance: true,
        currency: true,
        status: true,
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (!invoice.razorpayPaymentLinkId) {
      return NextResponse.json(
        { error: "No Razorpay payment link for this invoice" },
        { status: 404 },
      );
    }

    const paymentLink = await fetchPaymentLink(invoice.razorpayPaymentLinkId);

    return NextResponse.json({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      paymentLinkId: paymentLink.id,
      shortUrl: paymentLink.short_url,
      status: paymentLink.status,
      amount: paymentLink.amount / 100,
      amountPaid: paymentLink.amount_paid / 100,
      currency: paymentLink.currency,
      paymentsCount: paymentLink.payments_count,
      createdAt: paymentLink.created_at,
      updatedAt: paymentLink.updated_at,
    });
  } catch (error) {
    console.error("Failed to fetch Razorpay payment link:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await params;
    const invoiceId = parseInt(id, 10);
    const body = await req.json().catch(() => ({}));
    const action = (body.action as string) || "resend";

    if (isNaN(invoiceId)) {
      return NextResponse.json({ error: "Invalid invoice ID" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        OR: [{ ownerUserId: userId }, { userId }],
      },
      select: {
        id: true,
        razorpayPaymentLinkId: true,
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (!invoice.razorpayPaymentLinkId) {
      return NextResponse.json(
        { error: "No Razorpay payment link for this invoice" },
        { status: 404 },
      );
    }

    let result;
    if (action === "cancel") {
      result = await cancelPaymentLink(invoice.razorpayPaymentLinkId);
      // Clear the link from invoice
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          razorpayPaymentLinkId: null,
          razorpayPaymentLinkUrl: null,
        },
      });
    } else {
      result = await resendPaymentLink(invoice.razorpayPaymentLinkId);
    }

    return NextResponse.json({
      action,
      paymentLinkId: result.id,
      status: result.status,
      shortUrl: result.short_url,
    });
  } catch (error) {
    console.error("Failed to process Razorpay payment link action:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await params;
    const invoiceId = parseInt(id, 10);

    if (isNaN(invoiceId)) {
      return NextResponse.json({ error: "Invalid invoice ID" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        OR: [{ ownerUserId: userId }, { userId }],
      },
      select: { id: true, razorpayPaymentLinkId: true },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (!invoice.razorpayPaymentLinkId) {
      return NextResponse.json(
        { error: "No Razorpay payment link for this invoice" },
        { status: 404 },
      );
    }

    const result = await cancelPaymentLink(invoice.razorpayPaymentLinkId);

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        razorpayPaymentLinkId: null,
        razorpayPaymentLinkUrl: null,
      },
    });

    return NextResponse.json({
      cancelled: true,
      paymentLinkId: result.id,
      status: result.status,
    });
  } catch (error) {
    console.error("Failed to cancel Razorpay payment link:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

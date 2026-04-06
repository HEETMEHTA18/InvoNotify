import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { ensureCustomerSchema } from "@/lib/customer-schema";
import {
  calculateCibilScoreFromInvoices,
  deriveInvoiceStatus,
  getOverdueDays,
  normalizeCustomerKey,
} from "@/lib/customer-credit";

function normalizeCibilScore(value: unknown) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 650;
  return Math.max(300, Math.min(900, Math.round(score)));
}

// GET: Single customer with full invoice history
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await ensureCustomerSchema();

    const { id } = await params;
    const customerId = Number(id);
    if (!Number.isInteger(customerId)) {
      return NextResponse.json({ error: "Invalid customer id" }, { status: 400 });
    }

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, ownerUserId: userId },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const normalizedCustomerName = normalizeCustomerKey(customer.name);
    const normalizedCustomerEmail = normalizeCustomerKey(customer.email);

    const invoiceCandidates = await prisma.invoice.findMany({
      where: {
        AND: [
          { OR: [{ ownerUserId: userId }, { userId }] },
          {
            OR: [
              { customerId: customerId },
              {
                customerId: null,
                OR: [
                  { clientName: customer.name },
                  { customer: customer.name },
                  ...(customer.email ? [{ clientEmail: customer.email }] : []),
                ],
              },
            ],
          },
        ],
      },
      orderBy: { date: "desc" },
      select: {
        id: true,
        customerId: true,
        invoiceNumber: true,
        status: true,
        date: true,
        dueDate: true,
        total: true,
        amountPaid: true,
        balance: true,
        clientName: true,
        clientEmail: true,
        customer: true,
      },
    });

    const toLinkInvoiceIds: number[] = [];
    const customerInvoices = invoiceCandidates.filter((invoice) => {
      if (invoice.customerId === customerId) return true;

      const matchesByName =
        normalizeCustomerKey(invoice.clientName) === normalizedCustomerName ||
        normalizeCustomerKey(invoice.customer) === normalizedCustomerName;
      const matchesByEmail =
        normalizedCustomerEmail.length > 0 &&
        normalizeCustomerKey(invoice.clientEmail) === normalizedCustomerEmail;

      const matched = matchesByName || matchesByEmail;
      if (matched && invoice.customerId == null) {
        toLinkInvoiceIds.push(invoice.id);
      }
      return matched;
    });

    if (toLinkInvoiceIds.length > 0) {
      await prisma.invoice.updateMany({
        where: { id: { in: toLinkInvoiceIds } },
        data: { customerId: customerId },
      });
    }

    const overdueInvoiceIds = customerInvoices
      .filter((invoice) => deriveInvoiceStatus(invoice.status, invoice.dueDate, Number(invoice.balance || 0)) === "Overdue")
      .map((invoice) => invoice.id);

    if (overdueInvoiceIds.length > 0) {
      await prisma.invoice.updateMany({
        where: { id: { in: overdueInvoiceIds }, status: { not: "Paid" } },
        data: { status: "Overdue" },
      });
    }

    const recalculatedScore = calculateCibilScoreFromInvoices(
      customerInvoices.map((invoice) => ({
        status: invoice.status,
        dueDate: invoice.dueDate,
        total: Number(invoice.total || 0),
        amountPaid: Number(invoice.amountPaid || 0),
        balance: Number(invoice.balance || 0),
      }))
    );

    if (recalculatedScore !== normalizeCibilScore((customer as unknown as { cibilScore?: number }).cibilScore)) {
      await prisma.$executeRaw`
        UPDATE "Customer"
        SET "cibilScore" = ${recalculatedScore}, "updatedAt" = NOW()
        WHERE id = ${customerId} AND "ownerUserId" = ${userId}
      `;
      (customer as unknown as { cibilScore?: number }).cibilScore = recalculatedScore;
    }

    const response = {
      ...customer,
      cibilScore: normalizeCibilScore((customer as unknown as { cibilScore?: number }).cibilScore),
      invoices: customerInvoices.map((invoice) => {
        const normalizedStatus = deriveInvoiceStatus(invoice.status, invoice.dueDate, Number(invoice.balance || 0));
        return {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: normalizedStatus,
          overdueDays: getOverdueDays(invoice.dueDate, invoice.status, Number(invoice.balance || 0)),
          date: invoice.date,
          dueDate: invoice.dueDate,
          total: invoice.total,
          amountPaid: invoice.amountPaid,
          balance: invoice.balance,
        };
      }),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to fetch customer:", error);
    return NextResponse.json({ error: "Failed to fetch customer" }, { status: 500 });
  }
}

// PUT: Update customer
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await ensureCustomerSchema();

    const { id } = await params;
    const customerId = Number(id);
    if (!Number.isInteger(customerId)) {
      return NextResponse.json({ error: "Invalid customer id" }, { status: 400 });
    }

    const data = await req.json();

    const updateResult = await prisma.customer.updateMany({
      where: { id: customerId, ownerUserId: userId },
      data: {
        name: typeof data.name === "string" ? data.name : undefined,
        group: data.group ?? undefined,
        openingBalance: data.openingBalance !== undefined ? Number(data.openingBalance) : undefined,
        address: data.address ?? undefined,
        city: data.city ?? undefined,
        state: data.state ?? undefined,
        country: data.country ?? undefined,
        gstin: data.gstin ?? undefined,
        phone: data.phone ?? undefined,
        email: data.email ?? undefined,
      },
    });

    if (updateResult.count === 0) {
      return NextResponse.json({ error: "Customer not found or unauthorized" }, { status: 404 });
    }

    if (data.cibilScore !== undefined) {
      await prisma.$executeRaw`
        UPDATE "Customer"
        SET "cibilScore" = ${normalizeCibilScore(data.cibilScore)}, "updatedAt" = NOW()
        WHERE id = ${customerId} AND "ownerUserId" = ${userId}
      `;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update customer:", error);
    return NextResponse.json({ error: "Failed to update customer" }, { status: 500 });
  }
}

// DELETE: Delete customer
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await ensureCustomerSchema();

    const { id } = await params;
    const customerId = Number(id);
    if (!Number.isInteger(customerId)) {
      return NextResponse.json({ error: "Invalid customer id" }, { status: 400 });
    }

    const result = await prisma.customer.deleteMany({
      where: { id: customerId, ownerUserId: userId },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Customer not found or unauthorized" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete customer:", error);
    return NextResponse.json({ error: "Failed to delete customer" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { generateCustomersPdfBuffer } from "@/lib/customer-pdf";
import { ensureCustomerSchema } from "@/lib/customer-schema";

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureCustomerSchema();

    const customerIdParam = req.nextUrl.searchParams.get("customerId");
    const customerId = customerIdParam ? Number(customerIdParam) : null;

    const customers = await prisma.customer.findMany({
      where: {
        ownerUserId: userId,
        ...(Number.isInteger(customerId) ? { id: customerId as number } : {}),
      },
      orderBy: { name: "asc" },
    });

    if (!customers.length) {
      return NextResponse.json({ error: "No customer data available" }, { status: 404 });
    }

    const invoiceRows = await prisma.invoice.findMany({
      where: {
        ownerUserId: userId,
        customerId: { in: customers.map((customer) => customer.id) },
      },
      orderBy: { date: "desc" },
      select: {
        id: true,
        customerId: true,
        invoiceNumber: true,
        date: true,
        dueDate: true,
        status: true,
        total: true,
        amountPaid: true,
        balance: true,
      },
    });

    const historyByCustomerId = new Map<number, typeof invoiceRows>();
    for (const invoice of invoiceRows) {
      if (!invoice.customerId) continue;
      const existing = historyByCustomerId.get(invoice.customerId) || [];
      existing.push(invoice);
      historyByCustomerId.set(invoice.customerId, existing);
    }

    const sortedCustomers = [...customers].sort((a, b) => {
      const scoreA = (a as unknown as { cibilScore?: number }).cibilScore ?? 650;
      const scoreB = (b as unknown as { cibilScore?: number }).cibilScore ?? 650;
      return scoreA - scoreB;
    });

    const pdfData = await generateCustomersPdfBuffer(
      sortedCustomers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        city: customer.city,
        state: customer.state,
        cibilScore: (customer as unknown as { cibilScore?: number }).cibilScore ?? 650,
        openingBalance: toNumber(customer.openingBalance),
        history: (historyByCustomerId.get(customer.id) || []).map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          date: invoice.date.toISOString(),
          dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : null,
          status: invoice.status,
          total: toNumber(invoice.total),
          amountPaid: toNumber(invoice.amountPaid),
          balance: toNumber(invoice.balance),
        })),
      })),
      Number.isInteger(customerId) ? "Customer History Report" : "Customers and History Report"
    );

    return new NextResponse(Buffer.from(pdfData), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="customers-report-${Date.now()}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Failed to export customer report:", error);
    return NextResponse.json({ error: "Failed to export customer report" }, { status: 500 });
  }
}

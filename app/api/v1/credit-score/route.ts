import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchCreditScore, batchFetchCreditScores } from "@/lib/credit-bureau";

/**
 * POST /api/v1/credit-score
 *
 * Fetch credit score for one or more customers.
 * Body: { customerId?: number, customerIds?: number[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      customerId?: number;
      customerIds?: number[];
    };

    // Single customer
    if (body.customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: body.customerId },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          cibilScore: true,
        },
      });

      if (!customer) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      }

      const result = await fetchCreditScore({
        customerId: customer.id,
        customerName: customer.name,
        phone: customer.phone || undefined,
        existingScore: customer.cibilScore,
      });

      return NextResponse.json({
        customer: { id: customer.id, name: customer.name },
        creditScore: result,
      });
    }

    // Batch fetch
    if (body.customerIds?.length) {
      const customers = await prisma.customer.findMany({
        where: { id: { in: body.customerIds } },
        select: {
          id: true,
          name: true,
          phone: true,
          cibilScore: true,
        },
      });

      const results = await batchFetchCreditScores(
        customers.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone || undefined,
          cibilScore: c.cibilScore,
        })),
      );

      return NextResponse.json({
        results: Array.from(results.entries()).map(([customerId, result]) => ({
          customerId,
          creditScore: result,
        })),
      });
    }

    return NextResponse.json(
      { error: "Provide customerId or customerIds" },
      { status: 400 },
    );
  } catch (error) {
    console.error("Credit score fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch credit score" },
      { status: 500 },
    );
  }
}

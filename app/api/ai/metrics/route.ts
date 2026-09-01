import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStrategyStats } from "@/lib/ai/learning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const scope = { OR: [{ ownerUserId: userId }, { invoice: { ownerUserId: userId } }] };

    const [
      totalCases,
      casesLast24h,
      casesLast7d,
      statusCounts,
      actionCounts,
      recentRuns,
      recoveredTotal,
    ] = await Promise.all([
      prisma.recoveryCase.count({ where: scope }),
      prisma.recoveryCase.count({ where: { ...scope, createdAt: { gte: last24h } } }),
      prisma.recoveryCase.count({ where: { ...scope, createdAt: { gte: last7d } } }),
      prisma.recoveryCase.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
      prisma.agentAction.groupBy({
        by: ["actionType", "status"],
        where: {
          recoveryCase: scope,
          createdAt: { gte: last7d },
        },
        _count: { _all: true },
      }),
      prisma.agentRun.findMany({
        where: { ownerUserId: userId, startedAt: { gte: last7d } },
        orderBy: { startedAt: "desc" },
        take: 10,
        select: {
          id: true,
          trigger: true,
          status: true,
          totalInvoices: true,
          processedCount: true,
          actionCount: true,
          recoveredAmount: true,
          startedAt: true,
          completedAt: true,
        },
      }),
      prisma.recoveryCase.aggregate({
        // A partial payment is already confirmed cash even while the case is
        // open, so never filter this ledger-backed total by case status.
        where: scope,
        _sum: { recoveredAmount: true },
      }),
    ]);

    // Learning loop: proven win-rates per action × risk segment.
    const strategyStats = await getStrategyStats(userId);

    return NextResponse.json({
      summary: {
        totalCases,
        casesLast24h,
        casesLast7d,
        totalRecovered: Number(recoveredTotal._sum.recoveredAmount ?? 0),
      },
      statusDistribution: Object.fromEntries(
        statusCounts.map((s) => [s.status, s._count._all]),
      ),
      actionBreakdown: actionCounts.map((a) => ({
        action: a.actionType,
        status: a.status,
        count: a._count._all,
      })),
      learningLoop: {
        preferredByRiskLevel: strategyStats.byRiskLevel,
        strategyStats: strategyStats.overall,
        minSampleSize: 3,
      },
      recentRuns,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("Metrics fetch failed:", error);
    return NextResponse.json({ error: "Failed to fetch metrics" }, { status: 500 });
  }
}

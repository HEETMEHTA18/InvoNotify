import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runRecoverySweep } from "@/lib/ai/orchestrator";
import { rateLimitResponse, getRateLimitHeaders } from "@/lib/ai/rate-limit";
import { createLogger } from "@/lib/ai/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

const CRON_SWEEP_BATCH_SIZE = 3;

const log = createLogger("api:recovery");

const CASE_SELECT = {
  id: true,
  invoiceId: true,
  status: true,
  stage: true,
  riskScore: true,
  expectedRecovery: true,
  lastDecision: true,
  nextActionAt: true,
  updatedAt: true,
  invoice: {
    select: {
      invoiceNumber: true,
      clientName: true,
      balance: true,
      currency: true,
      dueDate: true,
      status: true,
    },
  },
  actions: {
    select: { status: true, actionType: true },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
} as const;

type CaseRow = {
  id: number;
  invoiceId: number;
  status: string;
  stage: string;
  riskScore: unknown;
  expectedRecovery: unknown;
  lastDecision: string | null;
  nextActionAt: Date | null;
  updatedAt: Date;
  invoice: {
    invoiceNumber: string;
    clientName: string;
    balance: unknown;
    currency: string;
    dueDate: Date | null;
    status: string;
  };
  actions: Array<{ status: string; actionType: string }>;
};

function toCaseListItem(row: CaseRow) {
  const balance = Number(row.invoice.balance ?? 0);
  const now = new Date();
  const daysOverdue =
    row.invoice.dueDate && new Date(row.invoice.dueDate) < now
      ? Math.max(
          0,
          Math.round(
            (now.getTime() - new Date(row.invoice.dueDate).getTime()) /
              (24 * 60 * 60 * 1000),
          ),
        )
      : 0;

  return {
    id: row.id,
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoice.invoiceNumber || `#${row.invoiceId}`,
    clientName: row.invoice.clientName || "Unknown",
    amountDue: balance,
    currency: row.invoice.currency || "INR",
    daysOverdue,
    riskScore: Number(row.riskScore),
    expectedRecovery: Number(row.expectedRecovery),
    status: row.status,
    stage: row.stage,
    lastDecision: row.lastDecision,
    nextActionAt: row.nextActionAt,
    updatedAt: row.updatedAt,
    lastActionStatus: row.actions?.[0]?.status ?? null,
    lastActionType: row.actions?.[0]?.actionType ?? null,
  };
}

export async function GET(req: NextRequest) {
  // Vercel Cron hits this endpoint with GET + Bearer CRON_SECRET to run the
  // autonomous sweep across all merchants (same pattern as /api/reminders/auto).
  if (isCronAuthorized(req)) {
    try {
      log.info("Recovery sweep triggered", { userId: null, trigger: "CRON" });
      const result = await runRecoverySweep({ trigger: "CRON", limit: CRON_SWEEP_BATCH_SIZE });
      log.info("Autonomous recovery sweep completed", {
        runId: result.runId,
        actions: result.actions,
        processed: result.processed,
        recoveredAmount: result.recoveredAmount,
        expectedRecoveryAmount: result.expectedRecoveryAmount,
      });
      return NextResponse.json(result);
    } catch (error) {
      log.error("Autonomous recovery sweep failed", { error: String(error) });
      return NextResponse.json({ error: "Recovery sweep failed" }, { status: 500 });
    }
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const statusParam = req.nextUrl.searchParams.get("status");
  const statusFilter =
    statusParam && statusParam !== "ALL"
      ? { status: statusParam }
      : { status: { not: "PAID" } };

  try {
    const cases = await prisma.recoveryCase.findMany({
      where: {
        ...statusFilter,
        OR: [{ ownerUserId: userId }, { invoice: { ownerUserId: userId } }],
      },
      select: CASE_SELECT,
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    const list = cases.map(toCaseListItem);

    const totalAtRisk = list
      .filter((c) => c.status !== "PAID" && c.status !== "BLOCKED")
      .reduce((sum, c) => sum + c.amountDue, 0);
    const expectedRecovery = list
      .filter((c) => c.status !== "PAID")
      .reduce((sum, c) => sum + c.expectedRecovery, 0);
    const paidCount = await prisma.recoveryCase.count({
      where: {
        status: "PAID",
        OR: [{ ownerUserId: userId }, { invoice: { ownerUserId: userId } }],
      },
    });

    const statusCounts = await prisma.recoveryCase.groupBy({
      by: ["status"],
      where: {
        OR: [{ ownerUserId: userId }, { invoice: { ownerUserId: userId } }],
      },
      _count: { _all: true },
    });

    // Actual money recovered: only amounts credited by confirmed, idempotent
    // payment records. expectedRecovery remains a forecast and is never used
    // as a cash KPI.
    const recoveredAgg = await prisma.recoveryCase.aggregate({
      where: {
        OR: [{ ownerUserId: userId }, { invoice: { ownerUserId: userId } }],
      },
      _sum: { recoveredAmount: true },
    });

    const summary = {
      totalAtRisk,
      expectedRecovery,
      recoveredAmount: Number(recoveredAgg._sum?.recoveredAmount ?? 0),
      overdueCount: list.length,
      paidCount,
      statusCounts: Object.fromEntries(
        statusCounts.map((s) => [s.status, s._count._all]),
      ),
    };

    return NextResponse.json({ summary, cases: list });
  } catch (error) {
    console.error("Failed to list recovery cases:", error);
    return NextResponse.json(
      { error: "Failed to list recovery cases" },
      { status: 500 },
    );
  }
}

function isCronAuthorized(req: NextRequest): boolean {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) return false;

  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  return bearer === configuredSecret || req.headers.get("x-cron-secret") === configuredSecret;
}

export async function POST(req: NextRequest) {
  // Cron trigger: sweeps ALL merchants autonomously (Vercel Cron / scheduler).
  if (isCronAuthorized(req)) {
    try {
      log.info("Recovery sweep triggered", { userId: null, trigger: "CRON" });
      const result = await runRecoverySweep({ trigger: "CRON", limit: CRON_SWEEP_BATCH_SIZE });
      log.info("Autonomous recovery sweep completed", {
        runId: result.runId,
        actions: result.actions,
        processed: result.processed,
        recoveredAmount: result.recoveredAmount,
        expectedRecoveryAmount: result.expectedRecoveryAmount,
      });
      return NextResponse.json(result);
    } catch (error) {
      log.error("Autonomous recovery sweep failed", { error: String(error) });
      return NextResponse.json({ error: "Recovery sweep failed" }, { status: 500 });
    }
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimitResponse("recovery:sweep", userId);
  if (!rl.ok) {
    return NextResponse.json(rl.body, {
      status: rl.status,
      headers: getRateLimitHeaders("recovery:sweep", userId),
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    log.info("Recovery sweep triggered", { userId, trigger: "MANUAL" });
    const result = await runRecoverySweep({
      userId,
      invoiceId: body.invoiceId ? Number(body.invoiceId) : undefined,
      trigger: "MANUAL",
      simulateFailures: Boolean(body.simulateFailures),
      dryRun: Boolean(body.dryRun),
    });
    log.info("Recovery sweep completed", {
      runId: result.runId,
      actions: result.actions,
      simulatedActions: result.simulatedActions,
      processed: result.processed,
    });
    return NextResponse.json(result, {
      headers: getRateLimitHeaders("recovery:sweep", userId),
    });
  } catch (error) {
    log.error("Recovery sweep failed", { userId, error: String(error) });
    return NextResponse.json(
      { error: "Recovery sweep failed" },
      { status: 500 },
    );
  }
}

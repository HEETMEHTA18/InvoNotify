import { prisma } from "@/lib/db";
import { createLogger } from "./logger";

const log = createLogger("ai:learning");

/** Minimum executions before a strategy's win-rate is trusted. */
export const MIN_SAMPLE_SIZE = 3;

export type StrategyStat = {
  actionType: string;
  riskLevel: string;
  attempts: number;
  wins: number;
  winRate: number;
};

export type StrategyStats = {
  overall: StrategyStat[];
  byRiskLevel: Record<string, string>;
};

/**
 * Adaptive Learning Loop (Roadmap: "Recovery learning loop").
 *
 * Derives which recovery actions ACTUALLY closed cases, purely from the
 * AgentAction audit trail — zero schema changes. When a RecoveryCase reaches
 * PAID, the last EXECUTED action before resolution is credited as the win.
 * Open cases with exhausted follow-ups count as losses for their attempted
 * action, giving an honest denominator.
 *
 * The result feeds back into the decision agent: over time the agent stops
 * guessing and starts preferring strategies with proven conversion per risk
 * segment.
 */
export async function getStrategyStats(ownerUserId?: string): Promise<StrategyStats> {
  const scope = ownerUserId
    ? { OR: [{ ownerUserId }, { invoice: { ownerUserId } }] }
    : {};

  try {
    // Seeded showcase actions demonstrate the UI but are not merchant outcomes.
    // Never let synthetic fixtures steer a real merchant's adaptive strategy.
    const realExecutedAction = {
      status: "EXECUTED",
      NOT: { payload: { path: ["seeded"], equals: true } },
    };

    // Resolved (won) cases: last executed action gets the credit.
    const wonCases = await prisma.recoveryCase.findMany({
      where: { ...scope, status: "PAID", resolvedAt: { not: null } },
      select: {
        id: true,
        riskScore: true,
        actions: {
          where: realExecutedAction,
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { actionType: true },
        },
      },
      take: 1000,
    });

    // Lost/stuck cases: any executed action counts as a failed attempt.
    const lostCases = await prisma.recoveryCase.findMany({
      where: {
        ...scope,
        status: { in: ["OPEN", "CONTACTED", "ESCALATED", "BLOCKED"] },
      },
      select: {
        id: true,
        riskScore: true,
        updatedAt: true,
        actions: {
          where: realExecutedAction,
          orderBy: { createdAt: "asc" },
          select: { actionType: true },
        },
      },
      take: 1000,
    });

    const buckets = new Map<string, { attempts: number; wins: number }>();

    const credit = (actionType: string | undefined, riskLevel: string, won: boolean) => {
      if (!actionType) return;
      const key = `${actionType}|${riskLevel}`;
      const b = buckets.get(key) ?? { attempts: 0, wins: 0 };
      b.attempts += 1;
      if (won) b.wins += 1;
      buckets.set(key, b);
    };

    const riskLevelOf = (score: number) =>
      score >= 0.7 ? "HIGH" : score >= 0.4 ? "MEDIUM" : "LOW";

    for (const c of wonCases) {
      credit(c.actions[0]?.actionType, riskLevelOf(Number(c.riskScore)), true);
    }

    // Only stale open cases (7+ days without movement) count as losses —
    // recent cases may simply still be waiting on the customer.
    const STALE_MS = 7 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - STALE_MS;
    for (const c of lostCases) {
      if (c.updatedAt.getTime() > cutoff) continue;
      const level = riskLevelOf(Number(c.riskScore));
      const seen = new Set<string>();
      for (const a of c.actions) {
        if (seen.has(a.actionType)) continue;
        seen.add(a.actionType);
        credit(a.actionType, level, false);
      }
    }

    const overall: StrategyStat[] = Array.from(buckets.entries())
      .map(([key, b]) => {
        const [actionType, riskLevel] = key.split("|");
        return {
          actionType,
          riskLevel,
          attempts: b.attempts,
          wins: b.wins,
          winRate: Number((b.wins / b.attempts).toFixed(3)),
        };
      })
      .sort((a, b) => b.winRate - a.winRate);

    // Best trusted action per risk segment (min sample size).
    const byRiskLevel: Record<string, string> = {};
    for (const level of ["LOW", "MEDIUM", "HIGH"]) {
      const candidates = overall.filter(
        (s) => s.riskLevel === level && s.attempts >= MIN_SAMPLE_SIZE && !s.actionType.startsWith("STOP"),
      );
      const best = candidates[0];
      if (best) byRiskLevel[level] = best.actionType;
    }

    return { overall, byRiskLevel };
  } catch (error) {
    log.warn("Failed to compute strategy stats", { error: String(error) });
    return { overall: [], byRiskLevel: {} };
  }
}

/**
 * Returns the historically-best action for a risk level, or null when there
 * isn't enough evidence yet (agent then falls back to its default policy).
 */
export function getPreferredAction(
  stats: StrategyStats,
  riskLevel: string,
): string | null {
  return stats.byRiskLevel[riskLevel] ?? null;
}

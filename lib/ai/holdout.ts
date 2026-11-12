/**
 * Permanent recovery holdout arm.
 *
 * Every recovery case is assigned once to one of two arms:
 *
 *   TREAT — eligible for the normal AI recovery path (score → decide → policy →
 *           act, all still bounded and audited).
 *   HOLD  — the control cohort. Scored and audited exactly like TREAT, but the
 *           agent never contacts the customer or creates a payment link.
 *
 * That single rule is what turns "our AI recovers 92.9%" into a measurement:
 * both arms share the same invoice population, the same clock, the same payment
 * webhooks and the same settlement ledger, so the difference in realised
 * recovery is an incremental effect rather than a simulated forecast.
 *
 * Assignment is deterministic in (merchant, invoiceId) — no random source, no
 * clock — so it survives retries, restarts and re-seeds without re-rolling a
 * case. It is also persisted on the case at creation, so changing the rate
 * later cannot move an existing case between arms.
 */
import { prisma, Prisma } from "@/lib/db";

export type ExperimentArm = "TREAT" | "HOLD";

export const EXPERIMENT_ARMS: ExperimentArm[] = ["TREAT", "HOLD"];

/** Bumping this invalidates earlier assignments; persisted cases keep theirs. */
export const HOLDOUT_ASSIGNMENT_VERSION = "v1";

export const DEFAULT_HOLDOUT_RATE = 0.1;
/** A control arm larger than half the cohort costs more recovery than it proves. */
export const MAX_HOLDOUT_RATE = 0.5;
/** Below this, a per-arm difference is noise, so the report refuses to call it. */
export const MIN_CASES_PER_ARM = 30;

/** Rate is read from `HOLDOUT_RATE` and clamped to a safe, auditable range. */
export function getHoldoutRate(raw: string | undefined = process.env.HOLDOUT_RATE): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_HOLDOUT_RATE;
  return Math.min(MAX_HOLDOUT_RATE, parsed);
}

function clampAssignmentRate(rate: number): number {
  if (!Number.isFinite(rate)) return DEFAULT_HOLDOUT_RATE;
  return Math.min(1, Math.max(0, rate));
}

/**
 * FNV-1a 32-bit, mapped to [0, 1). Chosen because it is stable across
 * processes, platforms and Node versions — a `Math.random()` draw or a hash of
 * the created-at timestamp would re-roll an arm on every sweep.
 */
export function hashToUnitInterval(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 0x1_0000_0000;
}

/**
 * Deterministic arm for a case. `rate` is the share of cases held back from
 * automation; 0 disables the experiment, 1 holds everything back.
 */
export function assignExperimentArm(input: {
  invoiceId: number;
  ownerUserId?: string | null;
  rate?: number;
}): ExperimentArm {
  const rate = clampAssignmentRate(input.rate ?? getHoldoutRate());
  if (rate <= 0) return "TREAT";
  if (rate >= 1) return "HOLD";

  const key = [
    "recovery-holdout",
    HOLDOUT_ASSIGNMENT_VERSION,
    input.ownerUserId ?? "global",
    input.invoiceId,
  ].join(":");
  return hashToUnitInterval(key) < rate ? "HOLD" : "TREAT";
}

// ── Statistics ──────────────────────────────────────────────────────────────

export type HoldoutCaseOutcome = {
  arm: ExperimentArm;
  /** Outstanding balance when the case opened. The denominator of recovery. */
  amountAtRisk: number;
  /** Confirmed settled cash attributed to this case. Never a forecast. */
  recoveredAmount: number;
};

export type HoldoutArmStats = {
  arm: ExperimentArm;
  cases: number;
  amountAtRisk: number;
  recoveredAmount: number;
  /** Money-weighted: cash recovered ÷ cash at risk. The headline number. */
  recoveredShareOfAtRisk: number;
  /** Cases that received any confirmed payment. */
  casesWithRecovery: number;
  /** Case-count conversion (a binomial rate, easier to put a CI on). */
  settledCaseRate: number;
  /**
   * Mean of each case's own recovered fraction. This — not the money-weighted
   * total — is what the confidence interval is computed on, so a single large
   * invoice cannot manufacture significance.
   */
  meanCaseRecoveryFraction: number;
  /**
   * Agresti–Coull standard error. Pseudo-counts are used deliberately: a sample
   * where every case recovered the same fraction has zero observed variance, and
   * a plain normal interval would then be zero-width and call a one-point gap
   * "significant".
   */
  standardError: number;
  /** 95% Agresti–Coull interval for the mean case fraction. */
  ci95: [number, number];
};

export type HoldoutVerdict =
  | "INSUFFICIENT_SAMPLE"
  | "NO_MEASURABLE_DIFFERENCE"
  | "MEASURED_UPLIFT"
  | "MEASURED_SHORTFALL";

export type HoldoutEffect = {
  /** Treated mean case recovery − control mean case recovery. */
  absoluteDelta: number;
  /** Delta relative to the control arm; null when control recovered nothing. */
  relativeDelta: number | null;
  /** Welch 95% interval for the difference in means. */
  ci95: [number, number];
  /** True only when the interval excludes zero and both arms have enough cases. */
  significant: boolean;
  verdict: HoldoutVerdict;
  interpretation: string;
};

const Z_95 = 1.96;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Agresti–Coull standard error for a mean of proportions: the observed sum plus
 * two pseudo-successes and two pseudo-failures. It agrees with the normal
 * approximation on large samples and stays finite on degenerate or tiny ones.
 */
function agrestiCoullStandardError(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const adjusted = (values.reduce((sum, v) => sum + v, 0) + Z_95 ** 2 / 2) / (n + Z_95 ** 2);
  const variance = (adjusted * (1 - adjusted)) / (n + Z_95 ** 2);
  return Math.sqrt(Math.max(0, variance));
}

function perCaseRecoveryFraction(outcome: HoldoutCaseOutcome): number {
  if (!(outcome.amountAtRisk > 0)) return 0;
  return clamp01(outcome.recoveredAmount / outcome.amountAtRisk);
}

export function summarizeArm(
  arm: ExperimentArm,
  outcomes: HoldoutCaseOutcome[],
): HoldoutArmStats {
  const scoped = outcomes.filter((o) => o.arm === arm);
  const fractions = scoped.map(perCaseRecoveryFraction);
  const amountAtRisk = scoped.reduce((sum, o) => sum + Math.max(0, o.amountAtRisk), 0);
  const recoveredAmount = scoped.reduce((sum, o) => sum + Math.max(0, o.recoveredAmount), 0);
  const casesWithRecovery = scoped.filter((o) => o.recoveredAmount > 0).length;
  const avg = mean(fractions);
  const se = agrestiCoullStandardError(fractions);

  return {
    arm,
    cases: scoped.length,
    amountAtRisk,
    recoveredAmount,
    recoveredShareOfAtRisk: amountAtRisk > 0 ? recoveredAmount / amountAtRisk : 0,
    casesWithRecovery,
    settledCaseRate: scoped.length > 0 ? casesWithRecovery / scoped.length : 0,
    meanCaseRecoveryFraction: avg,
    standardError: se,
    ci95: [clamp01(avg - Z_95 * se), clamp01(avg + Z_95 * se)],
  };
}

/**
 * Compares the arms. Withholding automation should not lose money, so a
 * negative delta is reported as a shortfall rather than hidden.
 */
export function compareArms(input: {
  treat: HoldoutArmStats;
  hold: HoldoutArmStats;
  minCasesPerArm?: number;
}): HoldoutEffect {
  const minCases = input.minCasesPerArm ?? MIN_CASES_PER_ARM;
  const { treat, hold } = input;
  const absoluteDelta = treat.meanCaseRecoveryFraction - hold.meanCaseRecoveryFraction;
  const relativeDelta =
    hold.meanCaseRecoveryFraction > 0
      ? absoluteDelta / hold.meanCaseRecoveryFraction
      : null;

  const seDifference = Math.sqrt(treat.standardError ** 2 + hold.standardError ** 2);
  const margin = Z_95 * seDifference;
  const lower = Math.max(-1, absoluteDelta - margin);
  const upper = Math.min(1, absoluteDelta + margin);
  const significant = lower > 0 || upper < 0;

  const underpowered =
    treat.cases < minCases || hold.cases < minCases;

  let verdict: HoldoutVerdict;
  let interpretation: string;

  if (underpowered) {
    verdict = "INSUFFICIENT_SAMPLE";
    interpretation =
      `Not enough measured cases to claim an effect: treatment ${treat.cases}, ` +
      `control ${hold.cases}, minimum ${minCases} per arm. Keep the holdout ` +
      `running; the report will switch to a measured verdict on its own.`;
  } else if (significant && absoluteDelta > 0) {
    verdict = "MEASURED_UPLIFT";
    interpretation =
      `Measured uplift: treated cases recovered ${(absoluteDelta * 100).toFixed(1)} ` +
      `percentage points more of their balance than the control arm ` +
      `(95% CI ${(lower * 100).toFixed(1)} to ${(upper * 100).toFixed(1)} pts).`;
  } else if (significant && absoluteDelta < 0) {
    verdict = "MEASURED_SHORTFALL";
    interpretation =
      `Measured shortfall: treated cases recovered ${(Math.abs(absoluteDelta) * 100).toFixed(1)} ` +
      `percentage points less than the control arm ` +
      `(95% CI ${(lower * 100).toFixed(1)} to ${(upper * 100).toFixed(1)} pts). ` +
      `Investigate before expanding automation.`;
  } else {
    verdict = "NO_MEASURABLE_DIFFERENCE";
    interpretation =
      `No measurable difference yet: the 95% interval for the effect ` +
      `(${(lower * 100).toFixed(1)} to ${(upper * 100).toFixed(1)} pts) includes zero.`;
  }

  return {
    absoluteDelta,
    relativeDelta,
    ci95: [lower, upper],
    significant: significant && !underpowered,
    verdict,
    interpretation,
  };
}

// ── Report ──────────────────────────────────────────────────────────────────

export type HoldoutReport = {
  generatedAt: string;
  assignment: {
    version: string;
    rate: number;
    deterministic: true;
    persistedAtCaseCreation: true;
  };
  scope: { ownerUserId: string | null };
  arms: Record<ExperimentArm, HoldoutArmStats>;
  effect: HoldoutEffect;
  provenance: {
    outcomeSource: "RecoverySettlement (unique paymentId)";
    measuredCases: number;
    excludedSeededDemoCases: number;
    excludedUnassignedCases: number;
    note: string;
  };
};

/** Pure report builder so the statistics can be tested without a database. */
export function buildHoldoutReport(input: {
  outcomes: HoldoutCaseOutcome[];
  rate?: number;
  ownerUserId?: string | null;
  excludedSeededDemoCases?: number;
  excludedUnassignedCases?: number;
  generatedAt?: Date;
  minCasesPerArm?: number;
}): HoldoutReport {
  const treat = summarizeArm("TREAT", input.outcomes);
  const hold = summarizeArm("HOLD", input.outcomes);

  return {
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    assignment: {
      version: HOLDOUT_ASSIGNMENT_VERSION,
      rate: clampAssignmentRate(input.rate ?? getHoldoutRate()),
      deterministic: true,
      persistedAtCaseCreation: true,
    },
    scope: { ownerUserId: input.ownerUserId ?? null },
    arms: { TREAT: treat, HOLD: hold },
    effect: compareArms({
      treat,
      hold,
      minCasesPerArm: input.minCasesPerArm,
    }),
    provenance: {
      outcomeSource: "RecoverySettlement (unique paymentId)",
      measuredCases: treat.cases + hold.cases,
      excludedSeededDemoCases: input.excludedSeededDemoCases ?? 0,
      excludedUnassignedCases: input.excludedUnassignedCases ?? 0,
      note:
        "Confirmed settlements only: seeded demo fixtures and unassigned legacy " +
        "cases are excluded, and neither arm can exceed its original amount at " +
        "risk. The recovery agent never contacts the control arm, while any older " +
        "reminder automation is arm-blind and treats both arms identically, so the " +
        "delta is the incremental effect of the agent over that baseline.",
    },
  };
}

/**
 * Reads the real outcome ledger and builds the comparison for one merchant (or
 * the whole deployment when no owner is supplied).
 */
export async function getHoldoutReport(
  ownerUserId?: string | null,
): Promise<HoldoutReport> {
  const scope: Prisma.RecoveryCaseWhereInput = ownerUserId
    ? { OR: [{ ownerUserId }, { invoice: { ownerUserId } }] }
    : {};

  const [rows, excludedUnassignedCases] = await Promise.all([
    prisma.recoveryCase.findMany({
      where: { ...scope, experimentAssignedAt: { not: null } },
      select: {
        experimentArm: true,
        amountAtRisk: true,
        settlements: {
          select: { paymentId: true, amount: true, attribution: true },
        },
      },
    }),
    prisma.recoveryCase.count({ where: { ...scope, experimentAssignedAt: null } }),
  ]);

  const outcomes: HoldoutCaseOutcome[] = [];
  let excludedSeededDemoCases = 0;

  for (const row of rows) {
    // De-duplicate by paymentId in memory as a second guard behind the unique
    // constraint, and never let a seeded fixture steer a measured claim.
    const settlements = new Map<number, number>();
    let seeded = false;
    for (const settlement of row.settlements) {
      if (settlement.attribution === "SEEDED_DEMO") {
        seeded = true;
        continue;
      }
      settlements.set(settlement.paymentId, Number(settlement.amount) || 0);
    }
    if (seeded) {
      excludedSeededDemoCases += 1;
      continue;
    }

    const amountAtRisk = Number(row.amountAtRisk) || 0;
    const recovered = Array.from(settlements.values()).reduce((sum, v) => sum + v, 0);

    outcomes.push({
      arm: row.experimentArm === "HOLD" ? "HOLD" : "TREAT",
      amountAtRisk,
      // Attribution can never exceed the balance that was at risk.
      recoveredAmount: amountAtRisk > 0 ? Math.min(recovered, amountAtRisk) : 0,
    });
  }

  return buildHoldoutReport({
    outcomes,
    ownerUserId: ownerUserId ?? null,
    excludedSeededDemoCases,
    excludedUnassignedCases,
  });
}

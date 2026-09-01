import { prisma } from "@/lib/db";
import { recoveryCaseScope } from "@/lib/security/authz";

/**
 * Module I analytics deliberately reads confirmed revenue from
 * `RecoverySettlement`, never from the denormalised RecoveryCase.recoveredAmount
 * cache. A settlement is unique by paymentId in the database, and the in-memory
 * de-duplication below is a second defensive guard for exported/test data.
 */

export const MAX_ANALYTICS_DAYS = 365;
export const ANALYTICS_DRILLDOWN_LIMIT = 100;

const CONTACT_OR_RETRY_ACTIONS = new Set([
  "SEND_REMINDER",
  "CREATE_PAYMENT_LINK",
  "RESEND_PAYMENT_LINK",
]);

type AnalyticsAction = {
  id: number;
  actionType: string;
  status: string;
  executionStatus: string | null;
  provider: string | null;
  payload: unknown;
};

type AnalyticsSettlement = {
  id: number;
  paymentId: number;
  amount: number;
  attribution: string;
  attributedAgentRunId: number | null;
  attributedAgentActionId: number | null;
};

export type AnalyticsCase = {
  id: number;
  status: string;
  stage: string;
  amountAtRisk: number;
  actions: AnalyticsAction[];
  settlements: AnalyticsSettlement[];
  diagnosis: { category: string | null } | null;
};

type AnalyticsRun = {
  id: number;
  trigger: string;
  status: string;
  totalInvoices: number;
  processedCount: number;
  actionCount: number;
  startedAt: Date;
  completedAt: Date | null;
  summary: unknown;
};

type UniqueSettlement = AnalyticsSettlement & { recoveryCaseId: number };

export type RecoveryAnalyticsInput = {
  days: number;
  startDate: Date;
  cases: AnalyticsCase[];
  recentRuns?: AnalyticsRun[];
};

type Drilldown = {
  caseIds: number[];
  totalCases: number;
  truncated: boolean;
};

type AnalyticsProvenance = {
  scope: "tenant_recovery_cases";
  periodBasis: "recovery_case_created_at";
  uniqueSettledRevenue: {
    source: "RecoverySettlement";
    uniqueness: "paymentId";
    /** Includes safe-demo ledger rows; their value is broken out separately. */
    uniqueSettledRecovered: number;
    nonDemoSettledRecovered: number;
    safeDemoRecovered: number;
    note: string;
  };
  actionHistory: {
    simulatedAttempts: number;
    note: string;
  };
  attribution: "Settlement-to-action linkage is potentially attributed, not causal proof.";
  pii: "No customer, invoice, payment, or contact fields are returned; drilldowns contain scoped recovery case IDs only.";
};

export type RecoveryAnalyticsSnapshot = {
  period: { days: number; startDate: Date };
  summary: {
    totalCases: number;
    amountAtRisk: number;
    /** Backward-compatible alias retained for the pre-existing overview API. */
    totalAtRisk: number;
    /**
     * Canonical settlement-ledger KPI. It is unique by paymentId and may include
     * local safe-demo fixtures; see safeDemoRecovered and provenance.
     */
    uniqueSettledRecovered: number;
    /**
     * Non-demo confirmed settlement cash. Kept distinct from the ledger-total
     * KPI so a deterministic local fixture cannot be labelled as live money.
     */
    confirmedUniqueRecovered: number;
    /** Backward-compatible alias, now backed by RecoverySettlement. */
    totalRecovered: number;
    nonDemoSettledRecovered: number;
    safeDemoRecovered: number;
    recoveryRate: number;
    recoveryRateDenominator: "amountAtRisk";
    caseConversion: number;
  };
  funnel: {
    detected: number;
    diagnosed: number;
    actioned: number;
    contactedOrRetried: number;
    recovered: number;
    escalated: number;
    stopped: number;
    /** Kept for API consumers of the original overview endpoint. */
    promised: number;
  };
  funnelDrilldowns: Record<
    "detected" | "diagnosed" | "actioned" | "contactedOrRetried" | "recovered" | "escalated" | "stopped",
    Drilldown
  >;
  interventions: Array<{
    actionType: string;
    attempts: number;
    actualAttempts: number;
    simulatedAttempts: number;
    caseCount: number;
    amountAtRisk: number;
    recoveredAmount: number;
    recoveryRate: number;
    caseConversion: number;
    drilldown: Drilldown;
    attribution: "POTENTIALLY_ACTION_ATTRIBUTED";
  }>;
  rootCauses: Array<{
    category: string;
    caseCount: number;
    amountAtRisk: number;
    recoveredAmount: number;
    recoveryRate: number;
    drilldown: Drilldown;
  }>;
  byCategory: Array<{ category: string; count: number }>;
  byAction: Array<{ action: string; count: number }>;
  recentRuns: Array<{
    id: number;
    trigger: string;
    status: string;
    totalInvoices: number;
    processedCount: number;
    actionCount: number;
    /** Ledger-backed, per-run confirmed settlement total. */
    recoveredAmount: number;
    simulated: boolean;
    startedAt: Date;
    completedAt: Date | null;
  }>;
  provenance: AnalyticsProvenance;
};

export function parseAnalyticsDays(value: string | null | undefined): number {
  const raw = Number(value ?? "30");
  if (!Number.isSafeInteger(raw)) return 30;
  return Math.min(MAX_ANALYTICS_DAYS, Math.max(1, raw));
}

function asPaise(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 100));
}

function asRupees(value: number): number {
  return value / 100;
}

function percent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Safe-demo actions must be visible, but must never masquerade as live contact. */
export function isSimulatedAction(action: Pick<AnalyticsAction, "status" | "executionStatus" | "provider" | "payload">): boolean {
  if (action.status === "SIMULATED" || action.executionStatus === "SIMULATED") return true;
  if (action.provider === "simulation") return true;
  if (!isRecord(action.payload)) return false;
  return action.payload.dryRun === true || action.payload.seeded === true;
}

function isSafeDemoSettlement(settlement: AnalyticsSettlement): boolean {
  return settlement.attribution === "SEEDED_DEMO";
}

function isActualContactOrRetry(action: AnalyticsAction): boolean {
  if (isSimulatedAction(action) || !CONTACT_OR_RETRY_ACTIONS.has(action.actionType)) return false;
  const execution = action.executionStatus ?? action.status;
  return execution === "EXECUTED" || execution === "SCHEDULED";
}

function isEscalated(caseRow: AnalyticsCase): boolean {
  return (
    caseRow.status === "ESCALATED" ||
    caseRow.actions.some(
      (action) =>
        !isSimulatedAction(action) &&
        action.actionType === "ESCALATE_TO_HUMAN" &&
        (action.executionStatus === "ESCALATED" || action.status === "ESCALATED"),
    )
  );
}

function isStopped(caseRow: AnalyticsCase): boolean {
  return (
    ["STOPPED", "BLOCKED", "CLOSED"].includes(caseRow.status) ||
    caseRow.actions.some((action) => action.actionType === "STOP")
  );
}

function hasDiagnosis(caseRow: AnalyticsCase): boolean {
  // Older recovery rows can have advanced beyond the DIAGNOSED stage before the
  // standalone diagnosis record was introduced. Preserve their journey in the
  // funnel without fabricating a diagnosis category for root-cause reporting.
  return (
    Boolean(caseRow.diagnosis) ||
    !["SCORING", "DIAGNOSING", ""].includes(caseRow.stage)
  );
}

function drilldown(caseIds: Iterable<number>): Drilldown {
  const ids = Array.from(new Set(caseIds)).sort((left, right) => left - right);
  return {
    caseIds: ids.slice(0, ANALYTICS_DRILLDOWN_LIMIT),
    totalCases: ids.length,
    truncated: ids.length > ANALYTICS_DRILLDOWN_LIMIT,
  };
}

function addToSetMap(map: Map<string, Set<number>>, key: string, caseId: number) {
  const ids = map.get(key) ?? new Set<number>();
  ids.add(caseId);
  map.set(key, ids);
}

/**
 * Pure aggregation layer shared by all Module I endpoints. It intentionally
 * accepts no customer or invoice shape, preventing accidental PII additions to
 * the public analytics API.
 */
export function buildRecoveryAnalytics(input: RecoveryAnalyticsInput): RecoveryAnalyticsSnapshot {
  const caseById = new Map(input.cases.map((caseRow) => [caseRow.id, caseRow]));
  const actionsById = new Map<number, AnalyticsAction & { recoveryCaseId: number }>();
  const settlementsByPaymentId = new Map<number, UniqueSettlement>();

  const funnelIds = {
    detected: new Set<number>(),
    diagnosed: new Set<number>(),
    actioned: new Set<number>(),
    contactedOrRetried: new Set<number>(),
    recovered: new Set<number>(),
    escalated: new Set<number>(),
    stopped: new Set<number>(),
  };
  const categoryCaseIds = new Map<string, Set<number>>();
  const actionCounts = new Map<string, number>();
  let simulatedActionCount = 0;

  for (const caseRow of input.cases) {
    funnelIds.detected.add(caseRow.id);
    if (hasDiagnosis(caseRow)) funnelIds.diagnosed.add(caseRow.id);
    if (caseRow.actions.length > 0) funnelIds.actioned.add(caseRow.id);
    if (caseRow.actions.some(isActualContactOrRetry)) funnelIds.contactedOrRetried.add(caseRow.id);
    if (isEscalated(caseRow)) funnelIds.escalated.add(caseRow.id);
    if (isStopped(caseRow)) funnelIds.stopped.add(caseRow.id);

    if (caseRow.diagnosis) {
      const category = caseRow.diagnosis.category?.trim() || "UNCLASSIFIED";
      addToSetMap(categoryCaseIds, category, caseRow.id);
    }

    for (const action of caseRow.actions) {
      actionsById.set(action.id, { ...action, recoveryCaseId: caseRow.id });
      actionCounts.set(action.actionType, (actionCounts.get(action.actionType) ?? 0) + 1);
      if (isSimulatedAction(action)) simulatedActionCount += 1;
    }

    for (const settlement of caseRow.settlements) {
      // RecoverySettlement.paymentId is unique in the schema. This makes stale
      // export/replay input safe too, without relying solely on that constraint.
      if (!settlementsByPaymentId.has(settlement.paymentId)) {
        settlementsByPaymentId.set(settlement.paymentId, { ...settlement, recoveryCaseId: caseRow.id });
      }
    }
  }

  const settlements = Array.from(settlementsByPaymentId.values());
  const settledPaiseByCase = new Map<number, number>();
  const runRecoveredPaise = new Map<number, number>();
  let ledgerRecoveredPaise = 0;
  let nonDemoSettledRecoveredPaise = 0;
  let safeDemoRecoveredPaise = 0;

  for (const settlement of settlements) {
    const amount = asPaise(settlement.amount);
    ledgerRecoveredPaise += amount;
    settledPaiseByCase.set(
      settlement.recoveryCaseId,
      (settledPaiseByCase.get(settlement.recoveryCaseId) ?? 0) + amount,
    );
    if (isSafeDemoSettlement(settlement)) {
      safeDemoRecoveredPaise += amount;
    } else {
      nonDemoSettledRecoveredPaise += amount;
    }
    if (settlement.attributedAgentRunId !== null) {
      runRecoveredPaise.set(
        settlement.attributedAgentRunId,
        (runRecoveredPaise.get(settlement.attributedAgentRunId) ?? 0) + amount,
      );
    }
  }

  for (const caseId of settledPaiseByCase.keys()) funnelIds.recovered.add(caseId);

  const amountAtRiskPaise = input.cases.reduce(
    (total, caseRow) => total + asPaise(caseRow.amountAtRisk),
    0,
  );
  const ledgerRecovered = asRupees(ledgerRecoveredPaise);
  const amountAtRisk = asRupees(amountAtRiskPaise);

  type MutableIntervention = {
    attempts: number;
    actualAttempts: number;
    simulatedAttempts: number;
    caseIds: Set<number>;
    recoveredPaise: number;
    recoveredPaymentIds: Set<number>;
    recoveredCaseIds: Set<number>;
  };
  const interventions = new Map<string, MutableIntervention>();
  for (const action of actionsById.values()) {
    const group = interventions.get(action.actionType) ?? {
      attempts: 0,
      actualAttempts: 0,
      simulatedAttempts: 0,
      caseIds: new Set<number>(),
      recoveredPaise: 0,
      recoveredPaymentIds: new Set<number>(),
      recoveredCaseIds: new Set<number>(),
    };
    group.attempts += 1;
    group.caseIds.add(action.recoveryCaseId);
    if (isSimulatedAction(action)) group.simulatedAttempts += 1;
    else group.actualAttempts += 1;
    interventions.set(action.actionType, group);
  }

  for (const settlement of settlements) {
    const actionId = settlement.attributedAgentActionId;
    if (actionId === null || settlement.attribution !== "POTENTIALLY_ACTION_ATTRIBUTED") continue;
    const action = actionsById.get(actionId);
    if (!action || isSimulatedAction(action)) continue;
    const group = interventions.get(action.actionType);
    if (!group || group.recoveredPaymentIds.has(settlement.paymentId)) continue;
    group.recoveredPaymentIds.add(settlement.paymentId);
    group.recoveredPaise += asPaise(settlement.amount);
    group.recoveredCaseIds.add(settlement.recoveryCaseId);
  }

  const rootCauses = Array.from(categoryCaseIds.entries())
    .map(([category, caseIds]) => {
      let atRiskPaise = 0;
      let recoveredPaise = 0;
      for (const caseId of caseIds) {
        atRiskPaise += asPaise(caseById.get(caseId)?.amountAtRisk ?? 0);
        recoveredPaise += settledPaiseByCase.get(caseId) ?? 0;
      }
      return {
        category,
        caseCount: caseIds.size,
        amountAtRisk: asRupees(atRiskPaise),
        recoveredAmount: asRupees(recoveredPaise),
        recoveryRate: percent(recoveredPaise, atRiskPaise),
        drilldown: drilldown(caseIds),
      };
    })
    .sort((left, right) => right.amountAtRisk - left.amountAtRisk || right.caseCount - left.caseCount || left.category.localeCompare(right.category));

  const byCategory = rootCauses.map(({ category, caseCount }) => ({ category, count: caseCount }));
  // The legacy overview exposed action-row counts (not case counts); retain
  // that contract while the dedicated intervention endpoint adds both metrics.
  const byAction = Array.from(actionCounts.entries())
    .map(([action, count]) => ({ action, count }))
    .sort((left, right) => right.count - left.count || left.action.localeCompare(right.action));

  const interventionRows = Array.from(interventions.entries())
    .map(([actionType, group]) => {
      let atRiskPaise = 0;
      for (const caseId of group.caseIds) {
        atRiskPaise += asPaise(caseById.get(caseId)?.amountAtRisk ?? 0);
      }
      return {
        actionType,
        attempts: group.attempts,
        actualAttempts: group.actualAttempts,
        simulatedAttempts: group.simulatedAttempts,
        caseCount: group.caseIds.size,
        amountAtRisk: asRupees(atRiskPaise),
        recoveredAmount: asRupees(group.recoveredPaise),
        recoveryRate: percent(group.recoveredPaise, atRiskPaise),
        caseConversion: percent(group.recoveredCaseIds.size, group.caseIds.size),
        drilldown: drilldown(group.caseIds),
        attribution: "POTENTIALLY_ACTION_ATTRIBUTED" as const,
      };
    })
    .sort((left, right) => right.recoveredAmount - left.recoveredAmount || right.attempts - left.attempts || left.actionType.localeCompare(right.actionType));

  const funnel = {
    detected: funnelIds.detected.size,
    diagnosed: funnelIds.diagnosed.size,
    actioned: funnelIds.actioned.size,
    contactedOrRetried: funnelIds.contactedOrRetried.size,
    recovered: funnelIds.recovered.size,
    escalated: funnelIds.escalated.size,
    stopped: funnelIds.stopped.size,
    promised: input.cases.filter((caseRow) => caseRow.status === "PROMISED").length,
  };
  const funnelDrilldowns = {
    detected: drilldown(funnelIds.detected),
    diagnosed: drilldown(funnelIds.diagnosed),
    actioned: drilldown(funnelIds.actioned),
    contactedOrRetried: drilldown(funnelIds.contactedOrRetried),
    recovered: drilldown(funnelIds.recovered),
    escalated: drilldown(funnelIds.escalated),
    stopped: drilldown(funnelIds.stopped),
  };

  const recentRuns = (input.recentRuns ?? []).map((run) => ({
    id: run.id,
    trigger: run.trigger,
    status: run.status,
    totalInvoices: run.totalInvoices,
    processedCount: run.processedCount,
    actionCount: run.actionCount,
    recoveredAmount: asRupees(runRecoveredPaise.get(run.id) ?? 0),
    simulated: isRecord(run.summary) && run.summary.dryRun === true,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  }));

  return {
    period: { days: input.days, startDate: input.startDate },
    summary: {
      totalCases: input.cases.length,
      amountAtRisk,
      totalAtRisk: amountAtRisk,
      uniqueSettledRecovered: ledgerRecovered,
      confirmedUniqueRecovered: asRupees(nonDemoSettledRecoveredPaise),
      totalRecovered: ledgerRecovered,
      nonDemoSettledRecovered: asRupees(nonDemoSettledRecoveredPaise),
      safeDemoRecovered: asRupees(safeDemoRecoveredPaise),
      recoveryRate: percent(ledgerRecoveredPaise, amountAtRiskPaise),
      recoveryRateDenominator: "amountAtRisk",
      caseConversion: percent(funnel.recovered, funnel.detected),
    },
    funnel,
    funnelDrilldowns,
    interventions: interventionRows,
    rootCauses,
    byCategory,
    byAction,
    recentRuns,
    provenance: {
      scope: "tenant_recovery_cases",
      periodBasis: "recovery_case_created_at",
      uniqueSettledRevenue: {
        source: "RecoverySettlement",
        uniqueness: "paymentId",
        uniqueSettledRecovered: ledgerRecovered,
        nonDemoSettledRecovered: asRupees(nonDemoSettledRecoveredPaise),
        safeDemoRecovered: asRupees(safeDemoRecoveredPaise),
        note: "SEEDED_DEMO rows are deterministic local fixtures, not live provider money. They remain visible only as a separately labelled component of the settlement ledger total.",
      },
      actionHistory: {
        simulatedAttempts: simulatedActionCount,
        note: "Dry-run, simulation-provider, and seeded local-demo actions are counted separately and are not treated as live customer contact.",
      },
      attribution: "Settlement-to-action linkage is potentially attributed, not causal proof.",
      pii: "No customer, invoice, payment, or contact fields are returned; drilldowns contain scoped recovery case IDs only.",
    },
  };
}

/** Fetches a tenant-scoped, PII-free Module I analytics snapshot. */
export async function getRecoveryAnalytics(userId: string, days: number): Promise<RecoveryAnalyticsSnapshot> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const scopedCases = {
    AND: [recoveryCaseScope(userId), { createdAt: { gte: startDate } }],
  };

  const [cases, recentRuns] = await Promise.all([
    prisma.recoveryCase.findMany({
      where: scopedCases,
      select: {
        id: true,
        status: true,
        stage: true,
        amountAtRisk: true,
        actions: {
          select: {
            id: true,
            actionType: true,
            status: true,
            executionStatus: true,
            provider: true,
            payload: true,
          },
        },
        settlements: {
          select: {
            id: true,
            paymentId: true,
            amount: true,
            attribution: true,
            attributedAgentRunId: true,
            attributedAgentActionId: true,
          },
        },
        diagnosis: { select: { category: true } },
      },
    }),
    prisma.agentRun.findMany({
      where: { ownerUserId: userId, startedAt: { gte: startDate } },
      orderBy: { startedAt: "desc" },
      take: 10,
      select: {
        id: true,
        trigger: true,
        status: true,
        totalInvoices: true,
        processedCount: true,
        actionCount: true,
        startedAt: true,
        completedAt: true,
        summary: true,
      },
    }),
  ]);

  return buildRecoveryAnalytics({
    days,
    startDate,
    cases: cases.map((caseRow) => ({
      id: caseRow.id,
      status: caseRow.status,
      stage: caseRow.stage,
      amountAtRisk: Number(caseRow.amountAtRisk),
      actions: caseRow.actions.map((action) => ({
        ...action,
        payload: action.payload,
      })),
      settlements: caseRow.settlements.map((settlement) => ({
        ...settlement,
        amount: Number(settlement.amount),
      })),
      diagnosis: caseRow.diagnosis,
    })),
    recentRuns: recentRuns.map((run) => ({ ...run, summary: run.summary })),
  });
}

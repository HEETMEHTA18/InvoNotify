import { prisma, Prisma } from "@/lib/db";
import { buildRecoveryContext } from "./context";
import { decideRecoveryAction } from "./agent/decision-agent";
import type { AgentDecision } from "./agent/types";
import { evaluatePolicy, CONTACT_ACTIONS } from "./policy/engine";
import { executeAction, storePaymentLinkOnInvoice } from "./actions/engine";
import type { PolicyVerdict, ContactHistory } from "./policy/engine";
import { createLogger } from "./logger";
import { getStrategyStats } from "./learning";
import { CHASEABLE_INVOICE_STATUSES } from "@/lib/customer-credit";
import { calculateRecoveryCredit } from "./revenue-ledger";
import { applyContactWindowGuard, getMerchantPolicy } from "./policy/merchant-policy";

const log = createLogger("ai:orchestrator");

/** Cases in one of these states are never eligible for another automated action. */
const TERMINAL_RECOVERY_CASE_STATUSES = new Set([
  "PAID",
  "RECOVERED",
  "STOPPED",
  "CLOSED",
  "CLOSED_UNRECOVERED",
]);

export function isTerminalRecoveryCaseStatus(status: string): boolean {
  return TERMINAL_RECOVERY_CASE_STATUSES.has(status);
}

export type SweepOptions = {
  userId?: string;
  invoiceId?: number;
  trigger?: "MANUAL" | "CRON" | "WEBHOOK";
  simulateFailures?: boolean;
  /** Persist recommendations and audit evidence without contacting a provider or customer. */
  dryRun?: boolean;
  now?: Date;
  /** Max invoices to process in this sweep. CRON sweeps should use a small batch to stay within function timeout. */
  limit?: number;
};

export type SweepInvoiceResult = {
  invoiceId: number;
  invoiceNumber: string;
  status: string;
  riskScore: number;
  riskLevel: string;
  expectedRecovery: number;
  recommendedAction: string;
  policyDecision: PolicyVerdict["decision"];
  actionStatus: string | null;
  error?: string;
};

export type SweepResult = {
  runId: number;
  totalInvoices: number;
  processed: number;
  actions: number;
  /** Confirmed money received during this sweep. Action execution does not count. */
  recoveredAmount: number;
  /** Forecast sum for executed, scheduled, or safely simulated actions; never cash collected. */
  expectedRecoveryAmount: number;
  /** Recommendations simulated without an external provider/customer side effect. */
  simulatedActions: number;
  invoiceResults: SweepInvoiceResult[];
};

function getOwnedInvoices(args: { userId?: string; invoiceId?: number; now: Date; limit?: number }) {
  const { userId, invoiceId, now, limit } = args;

  return prisma.invoice.findMany({
    where: {
      ...(invoiceId ? { id: invoiceId } : {}),
      ...(userId
        ? {
            AND: [
              { OR: [{ ownerUserId: userId }, { userId }] },
              { OR: [{ ownerUserId: { not: null } }, { userId: { not: null } }] },
            ],
          }
        : {}),
      status: { in: [...CHASEABLE_INVOICE_STATUSES] },
      dueDate: { lt: now },
      balance: { gt: 0 },
    },
    select: {
      id: true,
      invoiceNumber: true,
      balance: true,
      total: true,
      amountPaid: true,
      status: true,
      ownerUserId: true,
      userId: true,
    },
    orderBy: [{ dueDate: "asc" }],
    take: limit ?? 500,
  });
}

/**
 * Central recovery loop:
 *   overdue invoice → context → ML risk → decision → policy → execute → audit.
 * Every invoice gets a RecoveryCase and every decision/action gets a row in
 * AgentAction so the entire loop is explainable and auditable.
 */
export async function runRecoverySweep(options: SweepOptions = {}): Promise<SweepResult> {
  const now = options.now || new Date();
  const trigger = options.trigger || "MANUAL";

  const invoices = await getOwnedInvoices({
    userId: options.userId,
    invoiceId: options.invoiceId,
    now,
    limit: options.limit,
  });

  // Learning loop: fetch strategy effectiveness once per sweep so every
  // decision in this run benefits from all historical payment outcomes.
  const strategyStats = await getStrategyStats(options.userId);
  if (strategyStats.overall.length > 0) {
    log.info("Learning loop active", {
      segments: Object.keys(strategyStats.byRiskLevel),
      samples: strategyStats.overall.reduce((s, x) => s + x.attempts, 0),
    });
  }

  const run = await prisma.agentRun.create({
    data: {
      ownerUserId: options.userId ?? null,
      trigger,
      status: "RUNNING",
      totalInvoices: invoices.length,
      startedAt: now,
    },
  });

  const invoiceResults: SweepInvoiceResult[] = [];
  // A sweep only proposes/executes recovery actions. Cash is recorded later by
  // a confirmed, idempotent payment, never by an optimistic model forecast.
  const recoveredAmount = 0;
  let expectedRecoveryAmount = 0;
  let actionCount = 0;
  let simulatedActionCount = 0;

  for (const invoice of invoices) {
    try {
      const result = await processInvoice(invoice.id, run.id, {
        trigger,
        now,
        simulateFailures: options.simulateFailures,
        dryRun: options.dryRun,
        strategyStats,
        ownerUserId: invoice.ownerUserId ?? invoice.userId ?? options.userId ?? null,
      });

      if (
        result.actionStatus === "EXECUTED" ||
        result.actionStatus === "SCHEDULED" ||
        result.actionStatus === "SIMULATED"
      ) {
        expectedRecoveryAmount += result.expectedRecovery;
      }
      if (result.actionStatus === "EXECUTED" || result.actionStatus === "SCHEDULED") {
        actionCount += 1;
      } else if (result.actionStatus === "SIMULATED") {
        simulatedActionCount += 1;
      }

      invoiceResults.push(result);
    } catch (error) {
      invoiceResults.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber || `#${invoice.id}`,
        status: invoice.status,
        riskScore: 0,
        riskLevel: "UNKNOWN",
        expectedRecovery: 0,
        recommendedAction: "ERROR",
        policyDecision: "BLOCK",
        actionStatus: null,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const processed = invoiceResults.length;

  await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      status: "COMPLETED",
      processedCount: processed,
      actionCount,
      recoveredAmount,
      summary: {
        invoiceResults: invoiceResults.slice(0, 50),
        expectedRecoveryAmount,
        simulatedActionCount,
        dryRun: Boolean(options.dryRun),
        completedAt: new Date().toISOString(),
      },
      completedAt: new Date(),
    },
  });

  return {
    runId: run.id,
    totalInvoices: invoices.length,
    processed,
    actions: actionCount,
    recoveredAmount,
    expectedRecoveryAmount,
    simulatedActions: simulatedActionCount,
    invoiceResults,
  };
}

async function processInvoice(
  invoiceId: number,
  runId: number,
  opts: {
    trigger: string;
    now: Date;
    simulateFailures?: boolean;
    dryRun?: boolean;
    strategyStats?: Awaited<ReturnType<typeof getStrategyStats>>;
    ownerUserId: string | null;
  },
): Promise<SweepInvoiceResult> {
  const context = await buildRecoveryContext(invoiceId);
  const invoice = context.invoice;

  const recoveryCase = await prisma.recoveryCase.upsert({
    where: { invoiceId },
    create: {
      invoiceId,
      ownerUserId: opts.ownerUserId,
      status: "OPEN",
      stage: "SCORING",
      amountAtRisk: invoice.balance,
      riskScore: context.risk.riskScore,
      paymentProbability: context.risk.paymentProbability,
      expectedRecovery: context.risk.expectedRecovery,
    },
    update: {
      ...(opts.ownerUserId ? { ownerUserId: opts.ownerUserId } : {}),
      riskScore: context.risk.riskScore,
      paymentProbability: context.risk.paymentProbability,
      expectedRecovery: context.risk.expectedRecovery,
    },
  });

  // A sweep can be triggered repeatedly by a scheduler, a webhook and an
  // operator. Once a case is terminal, it must never create another autonomous
  // contact/retry. Keep an append-only audit marker so this safe skip remains
  // visible to judges and operators.
  if (isTerminalRecoveryCaseStatus(recoveryCase.status)) {
    await prisma.auditLog.create({
      data: {
        recoveryCaseId: recoveryCase.id,
        eventType: "AUTOMATION_SKIPPED_TERMINAL_CASE",
        actor: "recovery-orchestrator",
        metadata: {
          status: recoveryCase.status,
          stage: recoveryCase.stage,
          trigger: opts.trigger,
          agentRunId: runId,
        },
      },
    });
    return {
      invoiceId,
      invoiceNumber: invoice.invoiceNumber || `#${invoice.id}`,
      status: invoice.status,
      riskScore: context.risk.riskScore,
      riskLevel: context.risk.riskLevel,
      expectedRecovery: context.risk.expectedRecovery,
      recommendedAction: "STOP",
      policyDecision: "BLOCK",
      actionStatus: "SKIPPED_TERMINAL_CASE",
    };
  }

  const priorActions = await getPriorActions(recoveryCase.id);
  const history = await getContactHistory(recoveryCase.id, opts.now);

  const decision: AgentDecision = await decideRecoveryAction({
    context,
    priorActions,
    now: opts.now,
    strategyStats: opts.strategyStats,
  });

  const merchantPolicy = await getMerchantPolicy(opts.ownerUserId);
  const evaluatedVerdict = evaluatePolicy({
    context,
    decision,
    flags: {
      disputed: invoice.status === "Disputed",
      optedOut: context.customer.communicationOptOut,
    },
    history,
    limits: merchantPolicy.limits,
  });
  const verdict = applyContactWindowGuard({
    verdict: evaluatedVerdict,
    action: decision.recommendedAction,
    now: opts.now,
    merchantBusinessHours: merchantPolicy.businessHours,
    customerContactWindow: context.customer.contactWindow,
  });

  let actionStatus: string | null = null;
  let payload: Record<string, unknown> | null = null;
  let failureReason: string | null = null;
  let fallbackUsed = false;
  let provider: string | null = null;

  if (verdict.decision === "ALLOW") {
    if (opts.dryRun && decision.recommendedAction !== "STOP") {
      actionStatus = "SIMULATED";
      payload = {
        dryRun: true,
        reason: "Safe demo run: no customer message or provider call was made",
      };
      provider = "simulation";
    } else if (opts.simulateFailures && decision.recommendedAction === "SEND_REMINDER") {
      actionStatus = "FAILED";
      failureReason = "Simulated provider outage for QA testing";
    } else {
      const result = await executeAction({
        context,
        decision,
        ownerUserId: opts.ownerUserId,
        now: opts.now,
      });
      actionStatus = result.status;
      payload = result.payload || null;
      failureReason = result.failureReason || null;
      fallbackUsed = result.fallbackUsed;
      provider = result.provider || null;

      // Store payment link reference on invoice if created
      if (
        result.status === "EXECUTED" &&
        (decision.recommendedAction === "CREATE_PAYMENT_LINK" || decision.recommendedAction === "RESEND_PAYMENT_LINK") &&
        result.payload?.paymentLinkId &&
        result.payload?.paymentLinkUrl
      ) {
        try {
          await storePaymentLinkOnInvoice(
            invoiceId,
            result.payload.paymentLinkId as string,
            result.payload.paymentLinkUrl as string,
          );
        } catch (e) {
          log.warn("Failed to store payment link on invoice", { invoiceId, error: String(e) });
        }
      }
    }
  }

  const stoppedByDecision = verdict.decision === "ALLOW" && decision.recommendedAction === "STOP";
  const caseStatus =
    stoppedByDecision
      ? "STOPPED"
      : verdict.decision === "BLOCK"
      ? "BLOCKED"
      : verdict.decision === "REQUIRE_HUMAN_APPROVAL"
        ? "AWAITING_APPROVAL"
        : actionStatus === "EXECUTED" || actionStatus === "SCHEDULED"
          ? "CONTACTED"
          : actionStatus === "ESCALATED"
            ? "ESCALATED"
            : "OPEN";

  const createdAction = await prisma.agentAction.create({
    data: {
      recoveryCaseId: recoveryCase.id,
      agentRunId: runId,
      invoiceId,
      actionType: decision.recommendedAction,
      channel: decision.channel,
      riskScore: context.risk.riskScore,
      decision: decision as unknown as object,
      reason: decision.reason,
      urgency: decision.urgency,
      confidence: decision.confidence,
      policyResult: verdict.decision,
      policyReasons: verdict.reasons,
      approvalRequired: verdict.approvalRequired,
      status:
        verdict.decision === "ALLOW"
          ? (actionStatus ?? "SKIPPED")
          : verdict.decision === "REQUIRE_HUMAN_APPROVAL"
            ? "PENDING"
            : "BLOCKED",
      executionStatus: actionStatus,
      failureReason,
      fallbackUsed,
      provider,
      payload: payload
        ? (payload as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      completedAt: actionStatus ? opts.now : null,
    },
  });

  const nextStage = stoppedByDecision
    ? "STOPPED"
    : verdict.decision === "REQUIRE_HUMAN_APPROVAL"
      ? "AWAITING_APPROVAL"
      : verdict.decision === "ALLOW"
        ? actionStatus === "SIMULATED"
          ? "SIMULATED"
          : "EXECUTION"
        : "BLOCKED";

  await prisma.$transaction([
    prisma.recoveryCase.update({
      where: { id: recoveryCase.id },
      data: {
        status: caseStatus,
        stage: nextStage,
        lastDecision: decision.recommendedAction,
        nextActionAt:
          stoppedByDecision || !decision.suggestedFollowUpHours
            ? null
            : new Date(opts.now.getTime() + decision.suggestedFollowUpHours * 60 * 60 * 1000),
      },
    }),
    prisma.guardrailEvaluation.create({
      data: {
        recoveryCaseId: recoveryCase.id,
        actionType: decision.recommendedAction,
        channel: decision.channel,
        result: verdict.decision,
        reasons: verdict.reasons,
        riskScore: context.risk.riskScore,
        amountAtRisk: invoice.balance,
        attemptCount: history.contactAttempts,
        contactCount: history.contactAttempts,
        optOut: context.customer.communicationOptOut,
      },
    }),
    prisma.auditLog.create({
      data: {
        recoveryCaseId: recoveryCase.id,
        actionId: createdAction.id,
        eventType: "RECOVERY_DECISION_EVALUATED",
        actor: "recovery-orchestrator",
        before: { status: recoveryCase.status, stage: recoveryCase.stage },
        after: { status: caseStatus, stage: nextStage, actionStatus },
        metadata: {
          agentRunId: runId,
          action: decision.recommendedAction,
          policyResult: verdict.decision,
          policyReasons: verdict.reasons,
          policyVersion: merchantPolicy.version,
          modelUsed: decision.modelUsed,
          dryRun: Boolean(opts.dryRun),
        },
      },
    }),
  ]);

  return {
    invoiceId,
    invoiceNumber: invoice.invoiceNumber || `#${invoice.id}`,
    status: invoice.status,
    riskScore: context.risk.riskScore,
    riskLevel: context.risk.riskLevel,
    expectedRecovery: context.risk.expectedRecovery,
    recommendedAction: decision.recommendedAction,
    policyDecision: verdict.decision,
    actionStatus,
    error: failureReason || undefined,
  };
}

async function getPriorActions(recoveryCaseId: number): Promise<string[]> {
  const actions = await prisma.agentAction.findMany({
    where: { recoveryCaseId, status: { in: ["EXECUTED", "SCHEDULED"] } },
    select: { actionType: true },
    orderBy: { createdAt: "asc" },
  });
  return actions.map((a) => a.actionType);
}

/**
 * Summarises the contact history for a case so the (pure) policy engine can
 * enforce its stopping rules — max attempts, cooldown, cost-to-recover floor —
 * and the daily escalation cap. The engine never touches the DB or the clock;
 * this is where both are read. `now` is threaded through from the sweep so a
 * simulated or back-dated run stays deterministic.
 */
export async function getContactHistory(recoveryCaseId: number, now: Date): Promise<ContactHistory> {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [contacts, escalationsToday] = await Promise.all([
    // Only actions that actually reached the customer count as attempts.
    prisma.agentAction.findMany({
      where: {
        recoveryCaseId,
        actionType: { in: CONTACT_ACTIONS },
        status: { in: ["EXECUTED", "SCHEDULED"] },
      },
      select: { completedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.agentAction.count({
      where: {
        recoveryCaseId,
        actionType: "ESCALATE_TO_HUMAN",
        createdAt: { gte: dayAgo },
      },
    }),
  ]);

  const lastContactAt =
    contacts.length > 0 ? contacts[0].completedAt ?? contacts[0].createdAt : null;

  return {
    now,
    contactAttempts: contacts.length,
    lastContactAt,
    escalationsToday,
  };
}

/**
 * Closes a recovery case when the underlying invoice is paid. Can be invoked
 * from a payment webhook after a successful payment is recorded.
 */
export async function resolveRecoveryCaseForPaidInvoiceInTransaction(
  tx: Prisma.TransactionClient,
  invoiceId: number,
): Promise<boolean> {
  const recoveryCase = await tx.recoveryCase.findUnique({
    where: { invoiceId },
    include: { invoice: { select: { status: true, balance: true } } },
  });
  if (!recoveryCase) return false;

  // Provider callbacks can be partial or out of order. A case must remain
  // recoverable until the underlying invoice is explicitly paid *and* has no
  // balance. Either signal on its own can be stale or incorrectly edited.
  if (recoveryCase.invoice.status !== "Paid" || Number(recoveryCase.invoice.balance) > 0) {
    return false;
  }

  await tx.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: { status: "PAID", stage: "RESOLVED", resolvedAt: new Date() },
  });
  // SCHEDULED work has not contacted the customer yet and must be cancelled
  // alongside approval-queue work once a payment has settled the invoice.
  await tx.agentAction.updateMany({
    where: { recoveryCaseId: recoveryCase.id, status: { in: ["PENDING", "SCHEDULED"] } },
    data: { status: "SKIPPED", executionStatus: "SKIPPED_INVOICE_PAID" },
  });

  return true;
}

export async function resolveRecoveryCaseForPaidInvoice(invoiceId: number): Promise<void> {
  await prisma.$transaction((tx) => resolveRecoveryCaseForPaidInvoiceInTransaction(tx, invoiceId));
}

/**
 * Credits only a confirmed, newly inserted payment to the recovery ledger.
 *
 * Webhook/manual-payment callers invoke this after their Payment row is
 * idempotently persisted. The latest executed recovery action receives the
 * run-level credit, while the case itself is capped at its original amount at
 * risk so the dashboard cannot double count repeated callbacks or overpays.
 */
export type ConfirmedRecoveryPayment = {
  invoiceId: number;
  paymentId: number;
  confirmedPaymentAmount: number;
};

export type RecoveryPaymentCredit = {
  creditedAmount: number;
  recoveredAmount: number;
  attribution: "UNATTRIBUTED" | "POTENTIALLY_ACTION_ATTRIBUTED";
};

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Applies a durable recovery settlement inside the transaction that inserted
 * the Payment row. `RecoverySettlement.paymentId` is unique, so even a retry
 * cannot credit the case or its run twice.
 */
export async function recordConfirmedRecoveryPaymentInTransaction(
  tx: Prisma.TransactionClient,
  input: ConfirmedRecoveryPayment,
): Promise<RecoveryPaymentCredit | null> {
  const { invoiceId, paymentId, confirmedPaymentAmount } = input;
  if (!Number.isFinite(confirmedPaymentAmount) || confirmedPaymentAmount <= 0) {
    return null;
  }

  const recoveryCase = await tx.recoveryCase.findUnique({
    where: { invoiceId },
    select: { id: true, amountAtRisk: true, recoveredAmount: true },
  });
  if (!recoveryCase) return null;

  const settlement = calculateRecoveryCredit({
    amountAtRisk: Number(recoveryCase.amountAtRisk),
    recoveredAmount: Number(recoveryCase.recoveredAmount),
    confirmedPaymentAmount,
  });
  if (settlement.creditedAmount <= 0) {
    return {
      creditedAmount: 0,
      recoveredAmount: settlement.recoveredAmount,
      attribution: "UNATTRIBUTED",
    };
  }

  const attributedAction = await tx.agentAction.findFirst({
    where: {
      recoveryCaseId: recoveryCase.id,
      agentRunId: { not: null },
      status: { in: ["EXECUTED", "SCHEDULED"] },
    },
    select: { id: true, agentRunId: true },
    orderBy: { completedAt: "desc" },
  });
  const attribution = attributedAction?.agentRunId
    ? "POTENTIALLY_ACTION_ATTRIBUTED"
    : "UNATTRIBUTED";

  try {
    await tx.recoverySettlement.create({
      data: {
        recoveryCaseId: recoveryCase.id,
        paymentId,
        amount: settlement.creditedAmount,
        attribution,
        attributedAgentRunId: attributedAction?.agentRunId ?? null,
        attributedAgentActionId: attributedAction?.id ?? null,
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    // The Payment was already settled in this transaction family. Do not
    // mutate the denormalised case/run totals a second time.
    return {
      creditedAmount: 0,
      recoveredAmount: Number(recoveryCase.recoveredAmount),
      attribution: "UNATTRIBUTED",
    };
  }

  await tx.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: { recoveredAmount: settlement.recoveredAmount },
  });

  if (attributedAction?.agentRunId) {
    await tx.agentRun.updateMany({
      where: { id: attributedAction.agentRunId },
      data: { recoveredAmount: { increment: settlement.creditedAmount } },
    });
  }

  return {
    creditedAmount: settlement.creditedAmount,
    recoveredAmount: settlement.recoveredAmount,
    attribution,
  };
}

export async function recordConfirmedRecoveryPayment(
  input: ConfirmedRecoveryPayment,
): Promise<RecoveryPaymentCredit | null> {
  return prisma.$transaction((tx) => recordConfirmedRecoveryPaymentInTransaction(tx, input));
}

import { prisma } from "@/lib/db";
import { toInputJson } from "@/lib/json";
import { buildRecoveryContext } from "@/lib/ai/context";
import { decideRecoveryAction } from "@/lib/ai/agent/decision-agent";
import type { AgentDecision, AllowedAction } from "@/lib/ai/agent/types";
import { evaluatePolicy } from "@/lib/ai/policy/engine";
import { applyContactWindowGuard, getMerchantPolicy } from "@/lib/ai/policy/merchant-policy";
import { getContactHistory, isTerminalRecoveryCaseStatus } from "@/lib/ai/orchestrator";
import { getStrategyStats } from "@/lib/ai/learning";

export const POLICY_VERSION = "default-v1";
export const STRATEGY_VERSION = "baseline-v1";

export function priorityForRisk(riskScore: number): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (riskScore >= 0.8) return "CRITICAL";
  if (riskScore >= 0.6) return "HIGH";
  if (riskScore >= 0.3) return "MEDIUM";
  return "LOW";
}

/** A PII-minimized evidence panel usable by Module D APIs and the operator UI. */
export async function recoveryProfile(invoiceId: number) {
  const context = await buildRecoveryContext(invoiceId);
  return {
    partialContext: false,
    refreshedAt: new Date().toISOString(),
    customer: {
      id: context.customer.id,
      segment: context.customer.isVipExempt ? "VIP" : context.customer.paymentSuccessRate >= 0.8 ? "RELIABLE" : "STANDARD",
      paymentSuccessRate: context.customer.paymentSuccessRate,
      previousInvoiceCount: context.customer.previousInvoiceCount,
      previousLatePayments: context.customer.previousLatePayments,
      averagePaymentDelayDays: context.customer.averagePaymentDelayDays,
      customerAgeDays: context.customer.customerAgeDays,
      communication: {
        emailEligible: !context.customer.communicationOptOut,
        smsEligible: false,
        voiceEligible: false,
        optedOut: context.customer.communicationOptOut,
      },
      contactWindow: context.customer.contactWindow
        ? {
            timezone: context.customer.contactWindow.timezone,
            businessHours: {
              start: context.customer.contactWindow.start,
              end: context.customer.contactWindow.end,
            },
            businessDays: context.customer.contactWindow.businessDays,
          }
        : null,
    },
    transaction: {
      invoiceId: context.invoice.id,
      invoiceNumber: context.invoice.invoiceNumber,
      currency: context.invoice.currency,
      outstandingAmount: context.invoice.balance,
      daysOverdue: context.invoice.daysOverdue,
      paymentLinkAvailable: Boolean(context.invoice.razorpayPaymentLinkId),
    },
    derivedFeatures: context.features,
  };
}

export async function scoreRecoveryCase(args: {
  recoveryCaseId: number;
  invoiceId: number;
  actor: string;
}) {
  const context = await buildRecoveryContext(args.invoiceId);
  const priority = priorityForRisk(context.risk.riskScore);
  const assessment = await prisma.$transaction(async (tx) => {
    const row = await tx.riskAssessment.create({
      data: {
        recoveryCaseId: args.recoveryCaseId,
        riskScore: context.risk.riskScore,
        recoverabilityProbability: context.risk.paymentProbability,
        priority,
        estimatedRecoverableAmount: context.risk.expectedRecovery,
        modelName: context.risk.modelVersion.name,
        modelVersion: `${context.risk.modelVersion.name}:${context.risk.modelVersion.trainedAt}`,
        explanation: toInputJson({
          riskLevel: context.risk.riskLevel,
          contributions: context.risk.contributions,
          source: context.risk.modelVersion.source,
        }),
        featureSnapshots: { create: { features: toInputJson(context.features) } },
      },
      include: { featureSnapshots: true },
    });
    await tx.recoveryCase.update({
      where: { id: args.recoveryCaseId },
      data: {
        riskScore: context.risk.riskScore,
        paymentProbability: context.risk.paymentProbability,
        expectedRecovery: context.risk.expectedRecovery,
        stage: "SCORED",
      },
    });
    await tx.auditLog.create({
      data: {
        recoveryCaseId: args.recoveryCaseId,
        eventType: "RISK_ASSESSMENT_RECORDED",
        actor: args.actor,
        metadata: toInputJson({ assessmentId: row.id, priority, modelVersion: row.modelVersion }),
      },
    });
    return row;
  });
  return { assessment, context };
}

function candidateDecision(base: AgentDecision, action: AllowedAction): AgentDecision {
  return action === base.recommendedAction
    ? base
    : {
        ...base,
        recommendedAction: action,
        reason: action === "STOP" ? "Safe fallback: stop automation until an operator reviews the case." : "Alternative bounded recovery action.",
        confidence: Math.min(base.confidence, 0.5),
      };
}

export async function decideRecoveryCase(args: {
  recoveryCaseId: number;
  invoiceId: number;
  ownerUserId: string;
}) {
  const recoveryCase = await prisma.recoveryCase.findUnique({ where: { id: args.recoveryCaseId } });
  if (!recoveryCase) throw new Error("Recovery case not found");
  if (isTerminalRecoveryCaseStatus(recoveryCase.status)) {
    throw new Error(`Recovery case is terminal (${recoveryCase.status})`);
  }

  const context = await buildRecoveryContext(args.invoiceId);
  const [priorRows, history, strategyStats, merchantPolicy] = await Promise.all([
    prisma.agentAction.findMany({
      where: { recoveryCaseId: args.recoveryCaseId, status: { in: ["EXECUTED", "SCHEDULED", "SIMULATED"] } },
      select: { actionType: true },
      orderBy: { createdAt: "asc" },
    }),
    getContactHistory(args.recoveryCaseId, new Date()),
    getStrategyStats(args.ownerUserId),
    getMerchantPolicy(args.ownerUserId),
  ]);
  const selected = await decideRecoveryAction({
    context,
    priorActions: priorRows.map((row) => row.actionType),
    strategyStats,
  });
  const evaluatedVerdict = evaluatePolicy({
    context,
    decision: selected,
    flags: {
      disputed: context.invoice.status === "Disputed",
      optedOut: context.customer.communicationOptOut,
    },
    history,
    limits: merchantPolicy.limits,
  });
  const decisionTime = new Date();
  const verdict = applyContactWindowGuard({
    verdict: evaluatedVerdict,
    action: selected.recommendedAction,
    now: decisionTime,
    merchantBusinessHours: merchantPolicy.businessHours,
    customerContactWindow: context.customer.contactWindow,
  });

  const alternativeActions: AllowedAction[] = Array.from(
    new Set<AllowedAction>([selected.recommendedAction, "SEND_REMINDER", "CREATE_PAYMENT_LINK", "ESCALATE_TO_HUMAN", "STOP"]),
  ).slice(0, 5);
  const candidates = alternativeActions.map((action, index) => {
    const candidate = candidateDecision(selected, action);
    const candidateEvaluatedVerdict = evaluatePolicy({
      context,
      decision: candidate,
      flags: { disputed: context.invoice.status === "Disputed", optedOut: context.customer.communicationOptOut },
      history,
      limits: merchantPolicy.limits,
    });
    const candidateVerdict = applyContactWindowGuard({
      verdict: candidateEvaluatedVerdict,
      action,
      now: decisionTime,
      merchantBusinessHours: merchantPolicy.businessHours,
      customerContactWindow: context.customer.contactWindow,
    });
    const probability = action === selected.recommendedAction ? context.risk.paymentProbability : Math.max(0.01, context.risk.paymentProbability * (action === "STOP" ? 0 : 0.75));
    return { action, candidate, candidateVerdict, probability, rank: index + 1 };
  });

  const result = await prisma.$transaction(async (tx) => {
    const decision = await tx.recoveryDecision.create({
      data: {
        recoveryCaseId: args.recoveryCaseId,
        selectedAction: selected.recommendedAction,
        channel: selected.channel,
        expectedRecovery: context.risk.expectedRecovery,
        expectedProbability: context.risk.paymentProbability,
        rationale: selected.reason,
        riskScore: context.risk.riskScore,
        confidence: selected.confidence,
        status: verdict.decision === "ALLOW" ? "APPROVED" : verdict.decision,
        policyVersion: merchantPolicy.version,
        strategyVersion: STRATEGY_VERSION,
        candidates: {
          create: candidates.map((candidate) => ({
            actionType: candidate.action,
            channel: candidate.candidate.channel,
            expectedRecovery: context.invoice.balance * candidate.probability,
            expectedProbability: candidate.probability,
            score: candidate.probability,
            reason: candidate.candidate.reason,
            policyResult: candidate.candidateVerdict.decision,
            policyReasons: toInputJson(candidate.candidateVerdict.reasons),
            rank: candidate.rank,
          })),
        },
      },
      include: { candidates: { orderBy: { rank: "asc" } } },
    });
    const action = await tx.recoveryAction.create({
      data: {
        recoveryCaseId: args.recoveryCaseId,
        decisionId: decision.id,
        actionType: selected.recommendedAction,
        channel: selected.channel,
        status: verdict.decision === "BLOCK" ? "BLOCKED" : verdict.decision === "REQUIRE_HUMAN_APPROVAL" ? "PENDING_APPROVAL" : "PENDING",
        executionStatus: verdict.decision === "BLOCK" ? "BLOCKED" : null,
        provider: "simulation",
        policyVersion: merchantPolicy.version,
        scheduledAt: selected.suggestedFollowUpHours
          ? new Date(Date.now() + selected.suggestedFollowUpHours * 60 * 60 * 1000)
          : new Date(),
      },
    });
    const status = verdict.decision === "BLOCK" ? "BLOCKED" : verdict.decision === "REQUIRE_HUMAN_APPROVAL" ? "AWAITING_APPROVAL" : "OPEN";
    await tx.recoveryCase.update({
      where: { id: args.recoveryCaseId },
      data: { status, stage: "DECIDED", lastDecision: selected.recommendedAction, strategy: STRATEGY_VERSION },
    });
    await tx.guardrailEvaluation.create({
      data: {
        recoveryCaseId: args.recoveryCaseId,
        actionType: selected.recommendedAction,
        channel: selected.channel,
        result: verdict.decision,
        reasons: toInputJson(verdict.reasons),
        riskScore: context.risk.riskScore,
        amountAtRisk: context.invoice.balance,
        attemptCount: history.contactAttempts,
        contactCount: history.contactAttempts,
        optOut: context.customer.communicationOptOut,
      },
    });
    await tx.auditLog.create({
      data: {
        recoveryCaseId: args.recoveryCaseId,
        actionId: action.id,
        eventType: "RECOVERY_DECISION_PERSISTED",
        actor: args.ownerUserId,
        metadata: toInputJson({ decisionId: decision.id, policyResult: verdict.decision, policyVersion: merchantPolicy.version, strategyVersion: STRATEGY_VERSION }),
      },
    });
    return { decision, action };
  });
  return { ...result, verdict, selected, context };
}

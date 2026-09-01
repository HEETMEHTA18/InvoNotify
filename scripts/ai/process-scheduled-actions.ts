/**
 * Database-backed safe scheduler for the hackathon demo.
 *
 * It claims due RecoveryAction rows atomically, re-runs the policy engine, and
 * records a simulated execution. It never calls Razorpay or a notification
 * provider, so it is safe to run locally or in a preview environment.
 */
import { prisma } from "@/lib/db";
import { toInputJson } from "@/lib/json";
import { buildRecoveryContext } from "@/lib/ai/context";
import { getContactHistory, isTerminalRecoveryCaseStatus } from "@/lib/ai/orchestrator";
import { evaluatePolicy } from "@/lib/ai/policy/engine";
import { getMerchantPolicy, isWithinBusinessHours } from "@/lib/ai/policy/merchant-policy";

const allowedActions = new Set(["SEND_REMINDER", "CREATE_PAYMENT_LINK", "RESEND_PAYMENT_LINK", "SCHEDULE_FOLLOWUP", "ESCALATE_TO_HUMAN", "STOP"]);
const contactActions = new Set(["SEND_REMINDER", "CREATE_PAYMENT_LINK", "RESEND_PAYMENT_LINK"]);

async function main() {
  const now = new Date();
  const due = await prisma.recoveryAction.findMany({
    where: { status: { in: ["PENDING", "SCHEDULED"] }, scheduledAt: { lte: now } },
    include: { recoveryCase: { select: { id: true, invoiceId: true, ownerUserId: true, status: true } } },
    orderBy: { scheduledAt: "asc" },
    take: 100,
  });
  let simulated = 0;
  let blocked = 0;
  let skipped = 0;
  for (const action of due) {
    if (isTerminalRecoveryCaseStatus(action.recoveryCase.status) || !allowedActions.has(action.actionType)) {
      skipped += 1;
      continue;
    }
    const claimed = await prisma.recoveryAction.updateMany({
      where: { id: action.id, status: { in: ["PENDING", "SCHEDULED"] } },
      data: { status: "RUNNING", executionStatus: "RUNNING", executedAt: now },
    });
    if (!claimed.count) continue;
    const context = await buildRecoveryContext(action.recoveryCase.invoiceId);
    const [history, merchantPolicy] = await Promise.all([
      getContactHistory(action.recoveryCase.id, now),
      getMerchantPolicy(action.recoveryCase.ownerUserId),
    ]);
    const recommendedAction = action.actionType as "SEND_REMINDER" | "CREATE_PAYMENT_LINK" | "RESEND_PAYMENT_LINK" | "SCHEDULE_FOLLOWUP" | "ESCALATE_TO_HUMAN" | "STOP";
    const evaluated = evaluatePolicy({
      context,
      decision: { recommendedAction, channel: (action.channel || "EMAIL") as "EMAIL" | "SMS" | "BOTH", urgency: "MEDIUM", reason: "Scheduled safe simulation", confidence: 0.8, modelUsed: "rules" },
      flags: { disputed: context.invoice.status === "Disputed", optedOut: context.customer.communicationOptOut },
      history,
      limits: merchantPolicy.limits,
    });
    const verdict = contactActions.has(recommendedAction) && !isWithinBusinessHours(now, merchantPolicy.businessHours)
      ? { decision: "BLOCK" as const, approvalRequired: false, reasons: ["Contact action is outside configured merchant business hours"] }
      : evaluated;
    const isBlocked = verdict.decision === "BLOCK";
    const caseStatus = isBlocked ? "BLOCKED" : recommendedAction === "STOP" ? "STOPPED" : recommendedAction === "ESCALATE_TO_HUMAN" ? "ESCALATED" : "IN_RECOVERY";
    await prisma.$transaction(async (tx) => {
      if (recommendedAction === "ESCALATE_TO_HUMAN" && !isBlocked) {
        await tx.escalation.create({ data: { recoveryCaseId: action.recoveryCase.id, reason: "Scheduled simulated escalation", priority: "HIGH" } });
      }
      await tx.actionExecution.create({ data: { actionId: action.id, status: isBlocked ? "BLOCKED" : "SIMULATED", provider: "simulation", requestPayload: toInputJson({ scheduler: "database-polling", simulated: true }), responsePayload: toInputJson({ sent: false, simulated: true }) } });
      await tx.recoveryAction.update({ where: { id: action.id }, data: { status: isBlocked ? "BLOCKED" : "SUCCEEDED", executionStatus: isBlocked ? "BLOCKED" : "SIMULATED", provider: "simulation", error: isBlocked ? verdict.reasons.join("; ") : null, completedAt: now } });
      await tx.recoveryCase.update({ where: { id: action.recoveryCase.id }, data: { status: caseStatus, stage: caseStatus === "STOPPED" ? "STOPPED" : "EXECUTION" } });
      await tx.guardrailEvaluation.create({ data: { recoveryCaseId: action.recoveryCase.id, actionType: action.actionType, channel: action.channel, result: verdict.decision, reasons: toInputJson(verdict.reasons), riskScore: context.risk.riskScore, amountAtRisk: context.invoice.balance, attemptCount: history.contactAttempts, contactCount: history.contactAttempts, optOut: context.customer.communicationOptOut } });
      await tx.auditLog.create({ data: { recoveryCaseId: action.recoveryCase.id, actionId: action.id, eventType: isBlocked ? "SCHEDULED_ACTION_BLOCKED" : "SCHEDULED_ACTION_SIMULATED", actor: "recovery-scheduler", metadata: toInputJson({ simulation: true, policyVersion: merchantPolicy.version, policyResult: verdict.decision }) } });
    });
    if (isBlocked) blocked += 1; else simulated += 1;
  }
  console.log(JSON.stringify({ scheduler: "database-polling", due: due.length, simulated, blocked, skipped, externalCalls: 0 }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma['$disconnect']());

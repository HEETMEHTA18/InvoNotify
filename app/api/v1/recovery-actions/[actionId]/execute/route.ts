import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@/lib/db";
import { toInputJson } from "@/lib/json";
import { buildRecoveryContext } from "@/lib/ai/context";
import { getContactHistory, isTerminalRecoveryCaseStatus } from "@/lib/ai/orchestrator";
import { evaluatePolicy } from "@/lib/ai/policy/engine";
import { applyContactWindowGuard, getMerchantPolicy } from "@/lib/ai/policy/merchant-policy";
import { rateLimitResponse } from "@/lib/ai/rate-limit";
import { badRequest, notFound, parseId, recoveryCaseScope, requireUser } from "@/lib/security/authz";
import { crossOriginBlocked, isCrossOriginStateChange, readJson } from "@/lib/security/http";
import { z } from "zod";
import { requireRecoveryRole } from "@/lib/security/rbac";

const executionSchema = z.object({ mode: z.literal("SIMULATION").default("SIMULATION") }).strict();
const terminalActionStatuses = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "BLOCKED"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ actionId: string }> }) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;
    if (isCrossOriginStateChange(request)) return crossOriginBlocked();
    const role = await requireRecoveryRole(who.userId, ["ADMIN", "OPERATOR"]);
    if (!role.ok) return role.response;
    const limit = rateLimitResponse("recovery:execute", who.userId);
    if (!limit.ok) return NextResponse.json(limit.body, { status: limit.status });
    const actionId = parseId((await params).actionId);
    if (!actionId) return badRequest("Recovery action ID must be a positive integer");
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 255) return badRequest("An Idempotency-Key header (1–255 characters) is required");
    const body = await readJson<unknown>(request);
    if (!body.ok) return body.response;
    const { mode } = executionSchema.parse(body.data);

    const action = await prisma.recoveryAction.findFirst({
      where: { id: actionId, recoveryCase: { is: recoveryCaseScope(who.userId) } },
      include: { recoveryCase: { select: { id: true, invoiceId: true, status: true, stage: true } }, executions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!action) return notFound("Recovery action");
    if (action.idempotencyKey && action.idempotencyKey !== idempotencyKey) {
      return NextResponse.json({ error: "Action was created with a different idempotency key" }, { status: 409 });
    }
    if (terminalActionStatuses.has(action.status)) {
      return NextResponse.json({ action, idempotentReplay: true });
    }
    if (action.status === "PENDING_APPROVAL") {
      return NextResponse.json({ error: "Action requires human approval before execution" }, { status: 409 });
    }
    if (isTerminalRecoveryCaseStatus(action.recoveryCase.status)) {
      return NextResponse.json({ error: `Recovery case is terminal (${action.recoveryCase.status})` }, { status: 409 });
    }

    const context = await buildRecoveryContext(action.recoveryCase.invoiceId);
    const history = await getContactHistory(action.recoveryCase.id, new Date());
    const decision = {
      recommendedAction: action.actionType as "SEND_REMINDER" | "CREATE_PAYMENT_LINK" | "RESEND_PAYMENT_LINK" | "SCHEDULE_FOLLOWUP" | "ESCALATE_TO_HUMAN" | "STOP",
      channel: (action.channel || "EMAIL") as "EMAIL" | "SMS" | "BOTH",
      urgency: "MEDIUM" as const,
      reason: "Persisted recovery action",
      confidence: 0.8,
      modelUsed: "rules" as const,
    };
    const merchantPolicy = await getMerchantPolicy(who.userId);
    const evaluatedVerdict = evaluatePolicy({
      context,
      decision,
      flags: { disputed: context.invoice.status === "Disputed", optedOut: context.customer.communicationOptOut },
      history,
      limits: merchantPolicy.limits,
    });
    const verdict = applyContactWindowGuard({
      verdict: evaluatedVerdict,
      action: decision.recommendedAction,
      now: new Date(),
      merchantBusinessHours: merchantPolicy.businessHours,
      customerContactWindow: context.customer.contactWindow,
    });

    const outcome = verdict.decision === "BLOCK"
      ? { status: "BLOCKED", caseStatus: "BLOCKED", eventType: "RECOVERY_ACTION_BLOCKED" }
      : decision.recommendedAction === "STOP"
        ? { status: "SUCCEEDED", caseStatus: "STOPPED", eventType: "RECOVERY_ACTION_STOPPED" }
        : decision.recommendedAction === "ESCALATE_TO_HUMAN"
          ? { status: "SUCCEEDED", caseStatus: "ESCALATED", eventType: "RECOVERY_ACTION_ESCALATED" }
          : { status: "SUCCEEDED", caseStatus: "IN_RECOVERY", eventType: "RECOVERY_ACTION_SIMULATED" };

    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.recoveryAction.updateMany({
        where: { id: action.id, idempotencyKey: null, status: { in: ["PENDING", "SCHEDULED"] } },
        data: { idempotencyKey, status: "RUNNING", executionStatus: "RUNNING", executedAt: new Date() },
      });
      if (claimed.count === 0 && !action.idempotencyKey) {
        throw new Error("Action is already being executed or cannot be executed");
      }
      if (decision.recommendedAction === "ESCALATE_TO_HUMAN" && verdict.decision !== "BLOCK") {
        await tx.escalation.create({ data: { recoveryCaseId: action.recoveryCase.id, reason: "Simulated recovery escalation", priority: "HIGH" } });
      }
      const execution = await tx.actionExecution.create({
        data: {
          actionId: action.id,
          status: verdict.decision === "BLOCK" ? "BLOCKED" : "SIMULATED",
          provider: "simulation",
          requestPayload: toInputJson({ mode, idempotencyKey }),
          responsePayload: toInputJson({ sent: false, simulated: true, reason: "No provider or customer contact is performed by the safe demo" }),
        },
      });
      const updatedAction = await tx.recoveryAction.update({
        where: { id: action.id },
        data: {
          status: outcome.status,
          executionStatus: verdict.decision === "BLOCK" ? "BLOCKED" : "SIMULATED",
          provider: "simulation",
          providerResponse: toInputJson({ simulated: true, sent: false, mode }),
          error: verdict.decision === "BLOCK" ? verdict.reasons.join("; ") : null,
          completedAt: new Date(),
        },
      });
      await tx.recoveryCase.update({ where: { id: action.recoveryCase.id }, data: { status: outcome.caseStatus, stage: outcome.caseStatus === "STOPPED" ? "STOPPED" : "EXECUTION" } });
      await tx.guardrailEvaluation.create({
        data: { recoveryCaseId: action.recoveryCase.id, actionType: action.actionType, channel: action.channel, result: verdict.decision, reasons: toInputJson(verdict.reasons), riskScore: context.risk.riskScore, amountAtRisk: context.invoice.balance, attemptCount: history.contactAttempts, contactCount: history.contactAttempts, optOut: context.customer.communicationOptOut },
      });
      await tx.auditLog.create({
        data: { recoveryCaseId: action.recoveryCase.id, actionId: action.id, eventType: outcome.eventType, actor: who.userId, metadata: toInputJson({ simulation: true, idempotencyKey, policyResult: verdict.decision, policyVersion: merchantPolicy.version }) },
      });
      return { action: updatedAction, execution };
    });
    return NextResponse.json({ ...result, guardrail: verdict, simulation: true });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest("Validation failed", error.issues);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Duplicate idempotency key" }, { status: 409 });
    const message = error instanceof Error ? error.message : "Failed to execute recovery action";
    console.error("Recovery action execution error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

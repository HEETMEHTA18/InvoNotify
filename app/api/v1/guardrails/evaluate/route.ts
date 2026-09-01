import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toInputJson } from "@/lib/json";
import { buildRecoveryContext } from "@/lib/ai/context";
import { getContactHistory } from "@/lib/ai/orchestrator";
import { evaluatePolicy } from "@/lib/ai/policy/engine";
import { getMerchantPolicy, isWithinBusinessHours } from "@/lib/ai/policy/merchant-policy";
import { requireRecoveryRole } from "@/lib/security/rbac";
import { badRequest, notFound, recoveryCaseScope, requireUser } from "@/lib/security/authz";
import { crossOriginBlocked, isCrossOriginStateChange, readJson } from "@/lib/security/http";
import { z } from "zod";

const schema = z.object({ caseId: z.number().int().positive(), actionType: z.enum(["SEND_REMINDER", "CREATE_PAYMENT_LINK", "RESEND_PAYMENT_LINK", "SCHEDULE_FOLLOWUP", "ESCALATE_TO_HUMAN", "STOP"]), channel: z.enum(["EMAIL", "SMS", "BOTH"]).default("EMAIL"), confidence: z.number().min(0).max(1).default(0.8) }).strict();

export async function POST(request: NextRequest) {
  try {
    const who = await requireUser(); if (!who.ok) return who.response;
    if (isCrossOriginStateChange(request)) return crossOriginBlocked();
    const role = await requireRecoveryRole(who.userId, ["ADMIN", "OPERATOR", "REVIEWER"]); if (!role.ok) return role.response;
    const body = await readJson<unknown>(request); if (!body.ok) return body.response;
    const input = schema.parse(body.data);
    const recoveryCase = await prisma.recoveryCase.findFirst({ where: { id: input.caseId, ...recoveryCaseScope(who.userId) }, select: { id: true, invoiceId: true } });
    if (!recoveryCase) return notFound("Recovery case");
    const context = await buildRecoveryContext(recoveryCase.invoiceId);
    const history = await getContactHistory(recoveryCase.id, new Date());
    const policy = await getMerchantPolicy(who.userId);
    const evaluated = evaluatePolicy({ context, decision: { recommendedAction: input.actionType, channel: input.channel, urgency: "MEDIUM", reason: "Explicit guardrail evaluation", confidence: input.confidence, modelUsed: "rules" }, flags: { disputed: context.invoice.status === "Disputed", optedOut: context.customer.communicationOptOut }, history, limits: policy.limits });
    const verdict = ["SEND_REMINDER", "CREATE_PAYMENT_LINK", "RESEND_PAYMENT_LINK"].includes(input.actionType) && !isWithinBusinessHours(new Date(), policy.businessHours)
      ? { decision: "BLOCK" as const, approvalRequired: false, reasons: ["Contact action is outside configured merchant business hours"] }
      : evaluated;
    const evaluation = await prisma.guardrailEvaluation.create({ data: { recoveryCaseId: recoveryCase.id, actionType: input.actionType, channel: input.channel, result: verdict.decision, reasons: toInputJson(verdict.reasons), riskScore: context.risk.riskScore, amountAtRisk: context.invoice.balance, attemptCount: history.contactAttempts, contactCount: history.contactAttempts, optOut: context.customer.communicationOptOut } });
    await prisma.auditLog.create({ data: { recoveryCaseId: recoveryCase.id, eventType: "GUARDRAIL_EVALUATED", actor: who.userId, metadata: toInputJson({ evaluationId: evaluation.id, actionType: input.actionType, result: verdict.decision }) } });
    return NextResponse.json({ verdict, evaluation });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest("Validation failed", error.issues);
    console.error("Guardrail evaluation error:", error); return NextResponse.json({ error: "Failed to evaluate guardrails" }, { status: 500 });
  }
}

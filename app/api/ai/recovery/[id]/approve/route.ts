import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildRecoveryContext } from "@/lib/ai/context";
import { getContactHistory, isTerminalRecoveryCaseStatus } from "@/lib/ai/orchestrator";
import { executeAction } from "@/lib/ai/actions/engine";
import { evaluatePolicy } from "@/lib/ai/policy/engine";
import { getMerchantPolicy, isWithinBusinessHours } from "@/lib/ai/policy/merchant-policy";
import { rateLimitResponse, getRateLimitHeaders } from "@/lib/ai/rate-limit";
import { createLogger } from "@/lib/ai/logger";
import { requireRecoveryRole } from "@/lib/security/rbac";

export const runtime = "nodejs";

const log = createLogger("api:recovery:approve");

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = await requireRecoveryRole(userId, ["ADMIN", "OPERATOR"]);
  if (!role.ok) return role.response;

  const rl = rateLimitResponse("recovery:action", userId);
  if (!rl.ok) {
    return NextResponse.json(rl.body, {
      status: rl.status,
      headers: getRateLimitHeaders("recovery:action", userId),
    });
  }

  const { id } = await params;
  const caseId = Number(id);
  if (!Number.isInteger(caseId)) {
    return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
  }

  log.info("Approving recovery action", { caseId, userId });

  try {
    const recoveryCase = await prisma.recoveryCase.findFirst({
      where: {
        id: caseId,
        OR: [{ ownerUserId: userId }, { invoice: { ownerUserId: userId } }],
      },
      include: {
        invoice: { select: { ownerUserId: true } },
        actions: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!recoveryCase) {
      return NextResponse.json({ error: "Recovery case not found" }, { status: 404 });
    }

    if (isTerminalRecoveryCaseStatus(recoveryCase.status)) {
      return NextResponse.json(
        { error: `Recovery case is terminal (${recoveryCase.status}); no action can be approved` },
        { status: 409 },
      );
    }

    const pendingAction = recoveryCase.actions[0];
    if (!pendingAction) {
      return NextResponse.json(
        { error: "No action is pending approval for this case" },
        { status: 400 },
      );
    }

    const decision = pendingAction.decision as {
      recommendedAction: string;
      channel: string;
      reason: string;
      urgency: string;
      confidence: number;
    };

    const context = await buildRecoveryContext(recoveryCase.invoiceId);
    // The action may have waited in the review queue for hours or days. Reload
    // consent and contact history immediately before the side effect so a late
    // opt-out or newly reached limit is never evaluated against stale data.
    const history = await getContactHistory(recoveryCase.id, new Date());

    // Re-validate policy with explicit manual approval flag.
    const merchantPolicy = await getMerchantPolicy(userId);
    const evaluatedVerdict = evaluatePolicy({
      context,
      decision: {
        recommendedAction: pendingAction.actionType as never,
        channel: (decision?.channel || "EMAIL") as never,
        urgency: (decision?.urgency || "MEDIUM") as never,
        reason: pendingAction.reason || decision?.reason || "Approved by merchant",
        confidence: pendingAction.confidence ? Number(pendingAction.confidence) : 0.9,
        modelUsed: "rules",
      },
      flags: {
        manualApproval: true,
        disputed: context.invoice.status === "Disputed",
        optedOut: context.customer.communicationOptOut,
      },
      history,
      limits: merchantPolicy.limits,
    });
    const verdict = ["SEND_REMINDER", "CREATE_PAYMENT_LINK", "RESEND_PAYMENT_LINK"].includes(pendingAction.actionType)
      && !isWithinBusinessHours(new Date(), merchantPolicy.businessHours)
      ? { decision: "BLOCK" as const, approvalRequired: false, reasons: ["Contact action is outside configured merchant business hours"] }
      : evaluatedVerdict;

    if (verdict.decision === "BLOCK") {
      await prisma.$transaction([
        prisma.agentAction.update({
          where: { id: pendingAction.id },
          data: { status: "BLOCKED", executionStatus: "BLOCKED", failureReason: verdict.reasons.join("; ") },
        }),
        prisma.guardrailEvaluation.create({
          data: {
            recoveryCaseId: recoveryCase.id,
            actionType: pendingAction.actionType,
            channel: pendingAction.channel,
            result: verdict.decision,
            reasons: verdict.reasons,
            riskScore: context.risk.riskScore,
            amountAtRisk: context.invoice.balance,
            attemptCount: history.contactAttempts,
            contactCount: history.contactAttempts,
            optOut: context.customer.communicationOptOut,
          },
        }),
        prisma.auditLog.create({
          data: {
            recoveryCaseId: recoveryCase.id,
            actionId: pendingAction.id,
            eventType: "HUMAN_APPROVAL_BLOCKED_BY_POLICY",
            actor: userId,
            metadata: { reasons: verdict.reasons, policyVersion: merchantPolicy.version },
          },
        }),
      ]);
      return NextResponse.json({ error: "Blocked by policy", reasons: verdict.reasons }, { status: 409 });
    }

    const result = await executeAction({
      context,
      decision: {
        recommendedAction: pendingAction.actionType as never,
        channel: (decision?.channel || "EMAIL") as never,
        urgency: (decision?.urgency || "MEDIUM") as never,
        reason: pendingAction.reason || "Approved by merchant",
        confidence: Number(pendingAction.confidence || 0.9),
        modelUsed: "rules",
      },
      ownerUserId: recoveryCase.invoice.ownerUserId,
    });

    const newCaseStatus =
      result.status === "EXECUTED" || result.status === "SCHEDULED"
        ? "CONTACTED"
        : result.status === "ESCALATED"
          ? "ESCALATED"
          : "OPEN";

    await prisma.$transaction([
      prisma.agentAction.update({
        where: { id: pendingAction.id },
        data: {
          status: result.status,
          executionStatus: result.status,
          approvedBy: userId,
          approvedAt: new Date(),
          failureReason: result.failureReason,
          fallbackUsed: result.fallbackUsed,
          provider: result.provider,
          payload: (result.payload as object) || undefined,
          completedAt: result.completedAt,
        },
      }),
      prisma.recoveryCase.update({
        where: { id: recoveryCase.id },
        data: { status: newCaseStatus, stage: "EXECUTION", updatedAt: new Date() },
      }),
      prisma.guardrailEvaluation.create({
        data: {
          recoveryCaseId: recoveryCase.id,
          actionType: pendingAction.actionType,
          channel: pendingAction.channel,
          result: verdict.decision,
          reasons: verdict.reasons,
          riskScore: context.risk.riskScore,
          amountAtRisk: context.invoice.balance,
          attemptCount: history.contactAttempts,
          contactCount: history.contactAttempts,
          optOut: context.customer.communicationOptOut,
        },
      }),
      prisma.auditLog.create({
        data: {
          recoveryCaseId: recoveryCase.id,
          actionId: pendingAction.id,
          eventType: "HUMAN_APPROVED_RECOVERY_ACTION",
          actor: userId,
          metadata: { policyResult: verdict.decision, result: result.status, policyVersion: merchantPolicy.version },
        },
      }),
    ]);

    log.info("Action approved and executed", {
      caseId,
      actionType: pendingAction.actionType,
      result: result.status,
    });
    return NextResponse.json({ result }, {
      headers: getRateLimitHeaders("recovery:action", userId),
    });
  } catch (error) {
    log.error("Failed to approve recovery action", { caseId, error: String(error) });
    return NextResponse.json({ error: "Failed to approve recovery action" }, { status: 500 });
  }
}

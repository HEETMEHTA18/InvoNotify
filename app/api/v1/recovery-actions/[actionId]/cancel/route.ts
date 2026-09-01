import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toInputJson } from "@/lib/json";
import { badRequest, notFound, parseId, recoveryCaseScope, requireUser } from "@/lib/security/authz";
import { crossOriginBlocked, isCrossOriginStateChange } from "@/lib/security/http";
import { requireRecoveryRole } from "@/lib/security/rbac";

export async function POST(request: NextRequest, { params }: { params: Promise<{ actionId: string }> }) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;
    if (isCrossOriginStateChange(request)) return crossOriginBlocked();
    const role = await requireRecoveryRole(who.userId, ["ADMIN", "OPERATOR"]);
    if (!role.ok) return role.response;
    const actionId = parseId((await params).actionId);
    if (!actionId) return badRequest("Recovery action ID must be a positive integer");
    const action = await prisma.recoveryAction.findFirst({ where: { id: actionId, recoveryCase: { is: recoveryCaseScope(who.userId) } }, select: { id: true, recoveryCaseId: true, status: true } });
    if (!action) return notFound("Recovery action");
    if (!["PENDING", "SCHEDULED", "PENDING_APPROVAL"].includes(action.status)) return NextResponse.json({ error: "Only pending actions can be cancelled" }, { status: 409 });
    const result = await prisma.$transaction(async (tx) => {
      const updatedAction = await tx.recoveryAction.update({ where: { id: action.id }, data: { status: "CANCELLED", executionStatus: "CANCELLED", completedAt: new Date() } });
      await tx.actionExecution.create({ data: { actionId: action.id, status: "CANCELLED", provider: "operator", responsePayload: toInputJson({ cancelled: true }) } });
      await tx.auditLog.create({ data: { recoveryCaseId: action.recoveryCaseId, actionId: action.id, eventType: "RECOVERY_ACTION_CANCELLED", actor: who.userId } });
      return updatedAction;
    });
    return NextResponse.json({ action: result });
  } catch (error) {
    console.error("Recovery action cancellation error:", error);
    return NextResponse.json({ error: "Failed to cancel recovery action" }, { status: 500 });
  }
}

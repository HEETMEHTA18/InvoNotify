import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimitResponse } from "@/lib/ai/rate-limit";
import { badRequest, notFound, parseId, recoveryCaseScope, requireUser } from "@/lib/security/authz";
import { crossOriginBlocked, isCrossOriginStateChange } from "@/lib/security/http";
import { decideRecoveryCase } from "@/lib/recovery-case-service";
import { requireRecoveryRole } from "@/lib/security/rbac";

export async function POST(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;
    if (isCrossOriginStateChange(request)) return crossOriginBlocked();
    const role = await requireRecoveryRole(who.userId, ["ADMIN", "OPERATOR", "REVIEWER"]);
    if (!role.ok) return role.response;
    const limit = rateLimitResponse("recovery:decide", who.userId);
    if (!limit.ok) return NextResponse.json(limit.body, { status: limit.status });
    const caseId = parseId((await params).caseId);
    if (!caseId) return badRequest("Recovery case ID must be a positive integer");
    const recoveryCase = await prisma.recoveryCase.findFirst({
      where: { id: caseId, ...recoveryCaseScope(who.userId) },
      select: { id: true, invoiceId: true },
    });
    if (!recoveryCase) return notFound("Recovery case");
    const result = await decideRecoveryCase({ recoveryCaseId: recoveryCase.id, invoiceId: recoveryCase.invoiceId, ownerUserId: who.userId });
    return NextResponse.json({ decision: result.decision, action: result.action, guardrail: result.verdict, recommendation: result.selected });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to decide recovery case";
    const status = message.includes("terminal") ? 409 : 500;
    console.error("Recovery decision error:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

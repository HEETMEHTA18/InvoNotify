import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimitResponse } from "@/lib/ai/rate-limit";
import { badRequest, notFound, parseId, recoveryCaseScope, requireUser } from "@/lib/security/authz";
import { crossOriginBlocked, isCrossOriginStateChange } from "@/lib/security/http";
import { scoreRecoveryCase } from "@/lib/recovery-case-service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;
    if (isCrossOriginStateChange(request)) return crossOriginBlocked();
    const limit = rateLimitResponse("recovery:score", who.userId);
    if (!limit.ok) return NextResponse.json(limit.body, { status: limit.status });
    const caseId = parseId((await params).caseId);
    if (!caseId) return badRequest("Recovery case ID must be a positive integer");
    const recoveryCase = await prisma.recoveryCase.findFirst({
      where: { id: caseId, ...recoveryCaseScope(who.userId) },
      select: { id: true, invoiceId: true },
    });
    if (!recoveryCase) return notFound("Recovery case");
    const result = await scoreRecoveryCase({ recoveryCaseId: recoveryCase.id, invoiceId: recoveryCase.invoiceId, actor: who.userId });
    return NextResponse.json({ assessment: result.assessment, priority: result.assessment.priority });
  } catch (error) {
    console.error("Recovery score error:", error);
    return NextResponse.json({ error: "Failed to score recovery case" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toInputJson } from "@/lib/json";
import { rateLimitResponse } from "@/lib/ai/rate-limit";
import { badRequest, notFound, parseId, recoveryCaseScope, requireUser } from "@/lib/security/authz";
import { crossOriginBlocked, isCrossOriginStateChange } from "@/lib/security/http";
import { recoveryProfile } from "@/lib/recovery-case-service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;
    if (isCrossOriginStateChange(request)) return crossOriginBlocked();
    const limit = rateLimitResponse("recovery:enrich", who.userId);
    if (!limit.ok) return NextResponse.json(limit.body, { status: limit.status });
    const caseId = parseId((await params).caseId);
    if (!caseId) return badRequest("Recovery case ID must be a positive integer");
    const recoveryCase = await prisma.recoveryCase.findFirst({
      where: { id: caseId, ...recoveryCaseScope(who.userId) },
      select: { id: true, invoiceId: true },
    });
    if (!recoveryCase) return notFound("Recovery case");
    const profile = await recoveryProfile(recoveryCase.invoiceId);
    await prisma.$transaction([
      prisma.recoveryCase.update({ where: { id: recoveryCase.id }, data: { stage: "ENRICHED" } }),
      prisma.auditLog.create({
        data: { recoveryCaseId: recoveryCase.id, eventType: "RECOVERY_CONTEXT_ENRICHED", actor: who.userId, metadata: toInputJson({ refreshedAt: profile.refreshedAt, partialContext: profile.partialContext }) },
      }),
    ]);
    return NextResponse.json({ profile });
  } catch (error) {
    console.error("Recovery enrichment error:", error);
    return NextResponse.json({ error: "Failed to enrich recovery case" }, { status: 500 });
  }
}

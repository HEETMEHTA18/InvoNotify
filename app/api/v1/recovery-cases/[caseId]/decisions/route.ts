import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, notFound, parseId, recoveryCaseScope, requireUser } from "@/lib/security/authz";

export async function GET(_request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;
    const caseId = parseId((await params).caseId);
    if (!caseId) return badRequest("Recovery case ID must be a positive integer");
    const recoveryCase = await prisma.recoveryCase.findFirst({
      where: { id: caseId, ...recoveryCaseScope(who.userId) },
      select: { id: true },
    });
    if (!recoveryCase) return notFound("Recovery case");
    const decisions = await prisma.recoveryDecision.findMany({
      where: { recoveryCaseId: recoveryCase.id },
      include: { candidates: { orderBy: { rank: "asc" } } },
      orderBy: { decidedAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ decisions });
  } catch (error) {
    console.error("Recovery decisions fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch recovery decisions" }, { status: 500 });
  }
}

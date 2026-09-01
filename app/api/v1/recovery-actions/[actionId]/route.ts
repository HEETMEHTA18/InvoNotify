import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, notFound, parseId, recoveryCaseScope, requireUser } from "@/lib/security/authz";

export async function GET(_request: Request, { params }: { params: Promise<{ actionId: string }> }) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;
    const actionId = parseId((await params).actionId);
    if (!actionId) return badRequest("Recovery action ID must be a positive integer");
    const action = await prisma.recoveryAction.findFirst({
      where: { id: actionId, recoveryCase: { is: recoveryCaseScope(who.userId) } },
      include: { executions: { orderBy: { createdAt: "desc" } }, recoveryCase: { select: { id: true, status: true, stage: true } } },
    });
    if (!action) return notFound("Recovery action");
    return NextResponse.json({ action });
  } catch (error) {
    console.error("Recovery action fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch recovery action" }, { status: 500 });
  }
}

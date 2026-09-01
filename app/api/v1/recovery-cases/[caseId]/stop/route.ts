import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toInputJson } from "@/lib/json";
import { badRequest, notFound, parseId, recoveryCaseScope, requireUser } from "@/lib/security/authz";
import { crossOriginBlocked, isCrossOriginStateChange, readJson } from "@/lib/security/http";
import { z } from "zod";
import { requireRecoveryRole } from "@/lib/security/rbac";
const schema = z.object({ reason: z.string().trim().min(1).max(1000) }).strict();
export async function POST(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
  try { const who = await requireUser(); if (!who.ok) return who.response; if (isCrossOriginStateChange(request)) return crossOriginBlocked(); const role = await requireRecoveryRole(who.userId, ["ADMIN", "OPERATOR"]); if (!role.ok) return role.response; const caseId = parseId((await params).caseId); if (!caseId) return badRequest("Recovery case ID must be a positive integer"); const body = await readJson<unknown>(request); if (!body.ok) return body.response; const input = schema.parse(body.data); const row = await prisma.recoveryCase.findFirst({ where: { id: caseId, ...recoveryCaseScope(who.userId) }, select: { id: true, status: true } }); if (!row) return notFound("Recovery case"); const result = await prisma.$transaction(async (tx) => { const recoveryCase = await tx.recoveryCase.update({ where: { id: row.id }, data: { status: "STOPPED", stage: "STOPPED", resolvedAt: new Date() } }); await tx.auditLog.create({ data: { recoveryCaseId: row.id, eventType: "OPERATOR_STOPPED_RECOVERY_CASE", actor: who.userId, before: toInputJson({ status: row.status }), after: toInputJson({ status: "STOPPED" }), metadata: toInputJson({ reason: input.reason }) } }); return recoveryCase; }); return NextResponse.json({ recoveryCase: result }); } catch (error) { if (error instanceof z.ZodError) return badRequest("Validation failed", error.issues); console.error("Recovery stop error:", error); return NextResponse.json({ error: "Failed to stop recovery case" }, { status: 500 }); }
}

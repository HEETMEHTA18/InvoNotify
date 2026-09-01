import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toInputJson } from "@/lib/json";
import { badRequest, notFound, parseId, recoveryCaseScope, requireUser } from "@/lib/security/authz";
import { crossOriginBlocked, isCrossOriginStateChange, readJson } from "@/lib/security/http";
import { z } from "zod";
import { requireRecoveryRole } from "@/lib/security/rbac";
const schema = z.object({ reason: z.string().trim().min(1).max(1000), priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("HIGH") }).strict();
export async function POST(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
  try { const who = await requireUser(); if (!who.ok) return who.response; if (isCrossOriginStateChange(request)) return crossOriginBlocked(); const role = await requireRecoveryRole(who.userId, ["ADMIN", "OPERATOR"]); if (!role.ok) return role.response; const caseId = parseId((await params).caseId); if (!caseId) return badRequest("Recovery case ID must be a positive integer"); const body = await readJson<unknown>(request); if (!body.ok) return body.response; const input = schema.parse(body.data); const row = await prisma.recoveryCase.findFirst({ where: { id: caseId, ...recoveryCaseScope(who.userId) }, select: { id: true } }); if (!row) return notFound("Recovery case"); const result = await prisma.$transaction(async (tx) => { const escalation = await tx.escalation.create({ data: { recoveryCaseId: row.id, reason: input.reason, priority: input.priority } }); await tx.recoveryCase.update({ where: { id: row.id }, data: { status: "ESCALATED", stage: "ESCALATED" } }); await tx.auditLog.create({ data: { recoveryCaseId: row.id, eventType: "OPERATOR_ESCALATED_RECOVERY_CASE", actor: who.userId, metadata: toInputJson({ escalationId: escalation.id, ...input }) } }); return escalation; }); return NextResponse.json({ escalation: result }, { status: 201 }); } catch (error) { if (error instanceof z.ZodError) return badRequest("Validation failed", error.issues); console.error("Recovery escalation error:", error); return NextResponse.json({ error: "Failed to escalate recovery case" }, { status: 500 }); }
}

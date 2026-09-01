import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const RECOVERY_ROLES = ["ADMIN", "OPERATOR", "REVIEWER", "READ_ONLY"] as const;
export type RecoveryRole = (typeof RECOVERY_ROLES)[number];

export async function requireRecoveryRole(userId: string, allowed: readonly RecoveryRole[]) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  const role = (RECOVERY_ROLES as readonly string[]).includes(user?.role || "")
    ? (user!.role as RecoveryRole)
    : "READ_ONLY";
  if (!allowed.includes(role)) {
    return { ok: false as const, response: NextResponse.json({ error: "Insufficient recovery role" }, { status: 403 }), role };
  }
  return { ok: true as const, role };
}

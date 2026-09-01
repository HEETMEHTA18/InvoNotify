import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toInputJson } from "@/lib/json";
import { badRequest, requireUser } from "@/lib/security/authz";
import { requireRecoveryRole } from "@/lib/security/rbac";
import { crossOriginBlocked, isCrossOriginStateChange, readJson } from "@/lib/security/http";
import { z } from "zod";

const policySchema = z.object({
  name: z.string().trim().min(1).max(120).default("Default recovery policy"),
  autoMoneyLimit: z.number().finite().positive().max(10_000_000).default(50_000),
  autoNotificationLimit: z.number().finite().positive().max(10_000_000).default(100_000),
  maxContactAttempts: z.number().int().min(0).max(20).default(4),
  contactCooldownHours: z.number().int().min(1).max(24 * 30).default(48),
  maxEscalationsPerDay: z.number().int().min(0).max(100).default(5),
  costToRecoverFloor: z.number().finite().nonnegative().max(1_000_000).default(200),
  businessHours: z.object({ start: z.number().int().min(0).max(23), end: z.number().int().min(1).max(24), timezone: z.string().trim().min(1).max(80) }).optional(),
}).strict();

export async function GET() {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;
    const policy = await prisma.recoveryPolicy.findUnique({ where: { merchantId: who.userId } });
    return NextResponse.json({ policy, defaults: policySchema.parse({}) });
  } catch (error) {
    console.error("Recovery policy fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch recovery policy" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;
    if (isCrossOriginStateChange(request)) return crossOriginBlocked();
    const role = await requireRecoveryRole(who.userId, ["ADMIN"]);
    if (!role.ok) return role.response;
    const body = await readJson<unknown>(request);
    if (!body.ok) return body.response;
    const config = policySchema.parse(body.data);
    if (config.businessHours && config.businessHours.end <= config.businessHours.start) {
      return badRequest("businessHours.end must be after businessHours.start");
    }
    const existing = await prisma.recoveryPolicy.findUnique({ where: { merchantId: who.userId }, select: { version: true } });
    const policy = await prisma.recoveryPolicy.upsert({
      where: { merchantId: who.userId },
      update: { name: config.name, version: (existing?.version ?? 0) + 1, config: toInputJson(config), isActive: true },
      create: { merchantId: who.userId, name: config.name, version: 1, config: toInputJson(config) },
    });
    return NextResponse.json({ policy });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest("Validation failed", error.issues);
    console.error("Recovery policy update error:", error);
    return NextResponse.json({ error: "Failed to update recovery policy" }, { status: 500 });
  }
}

import { prisma } from "@/lib/db";
import { POLICY_LIMITS, type PolicyLimits } from "./engine";

type BusinessHours = { start: number; end: number; timezone: string };

export type MerchantPolicy = {
  limits: Partial<PolicyLimits>;
  version: string;
  businessHours?: BusinessHours;
};

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function businessHoursValue(value: unknown): BusinessHours | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  const start = candidate.start;
  const end = candidate.end;
  const timezone = candidate.timezone;
  if (typeof start !== "number" || typeof end !== "number" || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > 23 || end < 1 || end > 24 || end <= start || typeof timezone !== "string" || !timezone.trim()) return undefined;
  return { start, end, timezone };
}

/** Returns an active merchant policy or conservative defaults when none exists. */
export async function getMerchantPolicy(merchantId: string | null | undefined): Promise<MerchantPolicy> {
  if (!merchantId) return { limits: { ...POLICY_LIMITS }, version: "default-v1" };
  const row = await prisma.recoveryPolicy.findFirst({ where: { merchantId, isActive: true }, select: { version: true, config: true } });
  if (!row || !row.config || typeof row.config !== "object" || Array.isArray(row.config)) return { limits: { ...POLICY_LIMITS }, version: "default-v1" };
  const config = row.config as Record<string, unknown>;
  return {
    version: `merchant-v${row.version}`,
    limits: {
      autoMoneyLimit: numberValue(config.autoMoneyLimit, POLICY_LIMITS.autoMoneyLimit),
      autoNotificationLimit: numberValue(config.autoNotificationLimit, POLICY_LIMITS.autoNotificationLimit),
      maxContactAttempts: numberValue(config.maxContactAttempts, POLICY_LIMITS.maxContactAttempts),
      contactCooldownHours: numberValue(config.contactCooldownHours, POLICY_LIMITS.contactCooldownHours),
      maxEscalationsPerDay: numberValue(config.maxEscalationsPerDay, POLICY_LIMITS.maxEscalationsPerDay),
      costToRecoverFloor: numberValue(config.costToRecoverFloor, POLICY_LIMITS.costToRecoverFloor),
    },
    businessHours: businessHoursValue(config.businessHours),
  };
}

/** Contact actions are blocked outside explicit merchant hours; other actions remain safe. */
export function isWithinBusinessHours(now: Date, hours?: BusinessHours) {
  if (!hours) return true;
  try {
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: hours.timezone, hour: "2-digit", hourCycle: "h23" }).format(now));
    return Number.isInteger(hour) && hour >= hours.start && hour < hours.end;
  } catch {
    return false;
  }
}

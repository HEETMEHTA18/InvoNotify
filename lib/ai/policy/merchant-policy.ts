import { prisma } from "@/lib/db";
import { CONTACT_ACTIONS, type PolicyLimits, type PolicyVerdict, POLICY_LIMITS } from "./engine";

export type BusinessHours = { start: number; end: number; timezone: string };

/** A customer's consented local contact window. Weekday values use 0 = Sunday. */
export type CustomerContactWindow = {
  timezone: string;
  start: number;
  end: number;
  businessDays: number[];
};

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

function weekdayAt(now: Date, timezone: string): number | null {
  try {
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(now);
    const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
    return index >= 0 ? index : null;
  } catch {
    return null;
  }
}

/**
 * Returns false for invalid configuration as well as for an out-of-window
 * contact. That conservative default prevents a malformed timezone from
 * becoming an accidental permission to message a customer.
 */
export function isWithinCustomerContactWindow(now: Date, window?: CustomerContactWindow) {
  if (!window) return true;
  const { start, end, timezone, businessDays } = window;
  if (
    !Number.isInteger(start) || start < 0 || start > 23 ||
    !Number.isInteger(end) || end < 1 || end > 24 || end <= start ||
    !timezone.trim() ||
    !Array.isArray(businessDays) || businessDays.length === 0 ||
    businessDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  ) {
    return false;
  }
  const day = weekdayAt(now, timezone);
  if (day === null || !businessDays.includes(day)) return false;
  try {
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(now));
    return Number.isInteger(hour) && hour >= start && hour < end;
  } catch {
    return false;
  }
}

/** Applies contact-time restrictions consistently to every decision path. */
export function applyContactWindowGuard(args: {
  verdict: PolicyVerdict;
  action: string;
  now: Date;
  merchantBusinessHours?: BusinessHours;
  customerContactWindow?: CustomerContactWindow;
}): PolicyVerdict {
  if (!CONTACT_ACTIONS.includes(args.action as (typeof CONTACT_ACTIONS)[number])) return args.verdict;
  if (!isWithinBusinessHours(args.now, args.merchantBusinessHours)) {
    return { decision: "BLOCK", approvalRequired: false, reasons: ["Contact action is outside configured merchant business hours"] };
  }
  if (!isWithinCustomerContactWindow(args.now, args.customerContactWindow)) {
    return { decision: "BLOCK", approvalRequired: false, reasons: ["Contact action is outside the customer's configured local contact window"] };
  }
  return args.verdict;
}

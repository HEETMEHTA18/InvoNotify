import type { RecoveryContext } from "../context";
import type { AgentDecision, AllowedAction } from "../agent/types";

export type PolicyVerdict = {
  decision: "ALLOW" | "BLOCK" | "REQUIRE_HUMAN_APPROVAL";
  reasons: string[];
  approvalRequired: boolean;
};

/**
 * Contact history for the current recovery case, supplied by the orchestrator
 * (which owns the database). It is kept out of the engine so `evaluatePolicy`
 * stays a pure function — unit-testable without a DB. `now` is injected for the
 * same reason: the engine never calls `new Date()` itself.
 *
 * When `history` is omitted, the history-dependent stopping rules are skipped
 * (treated as a cooldown-free first contact), so existing callers and tests
 * keep working unchanged.
 */
export type ContactHistory = {
  now: Date;
  /** Successful customer-contact actions already recorded on this case. */
  contactAttempts: number;
  /** Timestamp of the most recent successful contact, if any. */
  lastContactAt: Date | null;
  /** ESCALATE_TO_HUMAN actions on this case in the trailing 24h. */
  escalationsToday: number;
};

export type PolicyInput = {
  context: RecoveryContext;
  decision: AgentDecision;
  flags?: {
    disputed?: boolean;
    optedOut?: boolean;
    manualApproval?: boolean;
  };
  history?: ContactHistory;
  /** Merchant-scoped limits, validated before they enter this pure evaluator. */
  limits?: Partial<PolicyLimits>;
};

/**
 * Central policy limits — one source of truth for every bound the autonomous
 * agent must respect. Imported by the decision agent so the thresholds are not
 * duplicated as magic numbers across the stack.
 */
export const POLICY_LIMITS = {
  /** Balance above which a payment-link action needs human approval (₹). */
  autoMoneyLimit: 50000,
  /** Balance above which even a plain notification needs human approval (₹). */
  autoNotificationLimit: 100000,
  /** Max autonomous customer-contact attempts before handing off to a human. */
  maxContactAttempts: 4,
  /** Minimum gap between two autonomous contacts on the same case (hours). */
  contactCooldownHours: 48,
  /** Max autonomous human escalations per rolling 24h, per case. */
  maxEscalationsPerDay: 5,
  /** Balance below which chasing is not worth the cost, after one free try (₹). */
  costToRecoverFloor: 200,
} as const;

export type PolicyLimits = {
  autoMoneyLimit: number;
  autoNotificationLimit: number;
  maxContactAttempts: number;
  contactCooldownHours: number;
  maxEscalationsPerDay: number;
  costToRecoverFloor: number;
};

/**
 * Safely merges a merchant's persisted policy with conservative application
 * defaults. Invalid values are ignored rather than weakening guardrails.
 */
export function resolvePolicyLimits(overrides?: Partial<PolicyLimits>): PolicyLimits {
  const base: PolicyLimits = { ...POLICY_LIMITS };
  if (!overrides) return base;
  for (const key of Object.keys(base) as Array<keyof PolicyLimits>) {
    const value = overrides[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      base[key] = value;
    }
  }
  return base;
}

/** Actions that actually message the customer (email / payment-link email). */
export const CONTACT_ACTIONS: AllowedAction[] = [
  "SEND_REMINDER",
  "CREATE_PAYMENT_LINK",
  "RESEND_PAYMENT_LINK",
];

/** Money actions — mint or resend a Razorpay payment link. */
const MONEY_ACTIONS: AllowedAction[] = [
  "CREATE_PAYMENT_LINK",
  "RESEND_PAYMENT_LINK",
];

/** Notification actions — do not create a money instrument. */
const NOTIFICATION_ACTIONS: AllowedAction[] = [
  "SEND_REMINDER",
  "SCHEDULE_FOLLOWUP",
];

const HOUR_MS = 60 * 60 * 1000;

/**
 * Deterministic safety layer. The LLM/decision agent can *suggest* anything;
 * this engine decides what is actually allowed to touch real money or contact
 * channels. It is a pure function of its inputs (no DB, no clock, no IO) so it
 * can be exhaustively unit-tested and reasoned about.
 *
 * Rule order (first match wins):
 *   1. Paid / no balance        → BLOCK   (nothing to recover)
 *   2. Disputed                 → BLOCK   (automation frozen)
 *   3. STOP                     → ALLOW   (a no-op is always safe)
 *   4. ESCALATE_TO_HUMAN        → ALLOW, unless the daily escalation cap is hit
 *   5. Opted out + contact      → BLOCK   (compliance; covers payment links)
 *   6. Stopping rules (contact) → BLOCK   (max attempts / cooldown / cost floor)
 *   7. Money actions            → approval gate by balance & risk, else ALLOW
 *   8. Notification actions     → approval gate by balance, else ALLOW
 *   9. Anything else            → BLOCK   (deny by default)
 */
export function evaluatePolicy(input: PolicyInput): PolicyVerdict {
  const { context, decision, flags, history } = input;
  const limits = resolvePolicyLimits(input.limits);
  const reasons: string[] = [];
  const balance = context.invoice.balance;
  const action = decision.recommendedAction;
  const approvedByHuman = Boolean(flags?.manualApproval);

  // 1. Hard block — nothing left to recover.
  if (context.invoice.status === "Paid" || balance <= 0) {
    return { decision: "BLOCK", reasons: ["Invoice is already paid"], approvalRequired: false };
  }

  // 2. Hard block — a disputed invoice freezes all automation.
  if (flags?.disputed) {
    return { decision: "BLOCK", reasons: ["Invoice is disputed; automation is suspended"], approvalRequired: false };
  }

  // 3. STOP is always safe — never block a decision to do nothing.
  if (action === "STOP") {
    return { decision: "ALLOW", reasons: ["STOP is a no-op and always safe"], approvalRequired: false };
  }

  // 4. Escalation only asks a human to look — allowed, but capped so a stuck
  //    case cannot flood the review queue. The cap counts already-recorded
  //    escalations, so it never double-counts the current proposal.
  if (action === "ESCALATE_TO_HUMAN") {
    if (history && history.escalationsToday >= limits.maxEscalationsPerDay) {
      return {
        decision: "BLOCK",
        reasons: [`Daily escalation cap reached (${limits.maxEscalationsPerDay} per 24h); wait before escalating again`],
        approvalRequired: false,
      };
    }
    return { decision: "ALLOW", reasons: ["Escalation only requests human review"], approvalRequired: false };
  }

  // 5. Compliance — a customer who opted out is never contacted on any channel,
  //    including a payment-link email. Not overridable by manual approval.
  if (flags?.optedOut && CONTACT_ACTIONS.includes(action)) {
    return { decision: "BLOCK", reasons: ["Customer opted out of communications"], approvalRequired: false };
  }

  // 6. Stopping rules — bound how hard the *autonomous* agent chases. A human
  //    who manually approves has taken the decision, so these are skipped then.
  //    Skipped entirely when no history is supplied (safe first-contact default).
  if (history && !approvedByHuman && CONTACT_ACTIONS.includes(action)) {
    if (history.contactAttempts >= limits.maxContactAttempts) {
      return {
        decision: "BLOCK",
        reasons: [`Reached ${limits.maxContactAttempts} automatic contact attempts; handing off to a human`],
        approvalRequired: false,
      };
    }
    if (history.lastContactAt) {
      const hoursSince = (history.now.getTime() - history.lastContactAt.getTime()) / HOUR_MS;
      if (hoursSince < limits.contactCooldownHours) {
        return {
          decision: "BLOCK",
          reasons: [`In cooldown — last contact ${hoursSince.toFixed(1)}h ago, minimum gap is ${limits.contactCooldownHours}h`],
          approvalRequired: false,
        };
      }
    }
    if (balance < limits.costToRecoverFloor && history.contactAttempts >= 1) {
      return {
        decision: "BLOCK",
        reasons: [`Balance ₹${balance.toLocaleString("en-IN")} is below the ₹${limits.costToRecoverFloor} cost-to-recover floor after ${history.contactAttempts} attempt(s)`],
        approvalRequired: false,
      };
    }
  }

  // 7. Money actions — bounded by balance and risk.
  if (MONEY_ACTIONS.includes(action)) {
    if (balance > limits.autoMoneyLimit && !approvedByHuman) {
      reasons.push(`Balance ₹${balance.toLocaleString("en-IN")} exceeds auto-payment-link limit of ₹${limits.autoMoneyLimit.toLocaleString("en-IN")}`);
      return { decision: "REQUIRE_HUMAN_APPROVAL", reasons, approvalRequired: true };
    }
    if (context.risk.riskLevel === "HIGH" && !approvedByHuman) {
      reasons.push("High-risk customer requires human approval before a payment link is created");
      return { decision: "REQUIRE_HUMAN_APPROVAL", reasons, approvalRequired: true };
    }
    reasons.push("Within automatic payment-link limits");
    return { decision: "ALLOW", reasons, approvalRequired: false };
  }

  // 8. Notification actions — higher ceiling; only very large balances gate.
  if (NOTIFICATION_ACTIONS.includes(action)) {
    if (balance > limits.autoNotificationLimit && !approvedByHuman) {
      reasons.push(`Balance ₹${balance.toLocaleString("en-IN")} exceeds auto-notification limit of ₹${limits.autoNotificationLimit.toLocaleString("en-IN")}`);
      return { decision: "REQUIRE_HUMAN_APPROVAL", reasons, approvalRequired: true };
    }
    reasons.push("Within automatic notification limits");
    return { decision: "ALLOW", reasons, approvalRequired: false };
  }

  // 9. Anything unrecognized is blocked by default.
  reasons.push(`Unknown action ${action}; blocked by default`);
  return { decision: "BLOCK", reasons, approvalRequired: false };
}

export function getPolicyLimits() {
  return { ...POLICY_LIMITS };
}

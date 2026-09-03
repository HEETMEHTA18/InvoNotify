import type { RecoveryContext } from "../context";

export const ALLOWED_ACTIONS = [
  "SEND_REMINDER",
  "CREATE_PAYMENT_LINK",
  "RESEND_PAYMENT_LINK",
  "SCHEDULE_FOLLOWUP",
  "ESCALATE_TO_HUMAN",
  "STOP",
] as const;

export type AllowedAction = (typeof ALLOWED_ACTIONS)[number];

export const ALLOWED_CHANNELS = ["EMAIL", "SMS", "WHATSAPP", "BOTH", "EMAIL_WHATSAPP"] as const;
export type Channel = (typeof ALLOWED_CHANNELS)[number];

export type Urgency = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AgentDecision = {
  recommendedAction: AllowedAction;
  channel: Channel;
  urgency: Urgency;
  reason: string;
  confidence: number;
  modelUsed: "llm" | "rules";
  suggestedFollowUpHours?: number;
};

export function isAllowedAction(value: unknown): value is AllowedAction {
  return typeof value === "string" && (ALLOWED_ACTIONS as readonly string[]).includes(value);
}

export function isAllowedChannel(value: unknown): value is Channel {
  return typeof value === "string" && (ALLOWED_CHANNELS as readonly string[]).includes(value);
}

export type DecisionInput = {
  context: RecoveryContext;
  priorActions: string[];
  now?: Date;
  /**
   * Historical strategy effectiveness (learning loop). When present, the
   * agent biases toward actions with proven conversion for this risk segment.
   */
  strategyStats?: {
    byRiskLevel: Record<string, string>;
  };
};

export function normalizeUrgency(value: unknown): Urgency {
  const raw = String(value || "").toUpperCase();
  if (raw === "LOW" || raw === "MEDIUM" || raw === "HIGH" || raw === "CRITICAL") return raw;
  return "MEDIUM";
}
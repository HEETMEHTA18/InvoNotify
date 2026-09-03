/**
 * Retry sequencing utility for recovery actions.
 *
 * Defines a structured retry schedule based on risk level and prior actions.
 * Each retry level escalates the channel and urgency.
 */

export type RetryLevel = 0 | 1 | 2 | 3 | 4;

export type RetrySchedule = {
  level: RetryLevel;
  delayHours: number;
  channel: "EMAIL" | "WHATSAPP" | "EMAIL_WHATSAPP";
  urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  action: "SEND_REMINDER" | "CREATE_PAYMENT_LINK" | "RESEND_PAYMENT_LINK" | "ESCALATE_TO_HUMAN";
  description: string;
};

/**
 * Retry schedule by risk level.
 *
 * LOW risk:    gentle reminders, email only
 * MEDIUM risk: payment link + WhatsApp
 * HIGH risk:   aggressive multi-channel + escalation
 * CRITICAL:    immediate escalation
 */
const RETRY_SCHEDULES: Record<string, RetrySchedule[]> = {
  LOW: [
    { level: 0, delayHours: 0,   channel: "EMAIL",          urgency: "LOW",    action: "SEND_REMINDER",       description: "Initial friendly reminder" },
    { level: 1, delayHours: 48,  channel: "EMAIL",          urgency: "LOW",    action: "SEND_REMINDER",       description: "Follow-up reminder (2 days)" },
    { level: 2, delayHours: 120, channel: "EMAIL_WHATSAPP", urgency: "MEDIUM", action: "CREATE_PAYMENT_LINK", description: "Payment link + multi-channel (5 days)" },
    { level: 3, delayHours: 240, channel: "EMAIL_WHATSAPP", urgency: "HIGH",   action: "RESEND_PAYMENT_LINK", description: "Resend link + escalate (10 days)" },
    { level: 4, delayHours: 360, channel: "EMAIL",          urgency: "HIGH",   action: "ESCALATE_TO_HUMAN",   description: "Final escalation (15 days)" },
  ],
  MEDIUM: [
    { level: 0, delayHours: 0,   channel: "EMAIL_WHATSAPP", urgency: "MEDIUM", action: "SEND_REMINDER",       description: "Initial reminder + WhatsApp" },
    { level: 1, delayHours: 24,  channel: "EMAIL_WHATSAPP", urgency: "MEDIUM", action: "CREATE_PAYMENT_LINK", description: "Payment link (1 day)" },
    { level: 2, delayHours: 72,  channel: "EMAIL_WHATSAPP", urgency: "HIGH",   action: "RESEND_PAYMENT_LINK", description: "Resend link (3 days)" },
    { level: 3, delayHours: 168, channel: "EMAIL",          urgency: "HIGH",   action: "ESCALATE_TO_HUMAN",   description: "Escalate to human (7 days)" },
  ],
  HIGH: [
    { level: 0, delayHours: 0,   channel: "EMAIL_WHATSAPP", urgency: "HIGH",   action: "CREATE_PAYMENT_LINK", description: "Immediate payment link" },
    { level: 1, delayHours: 24,  channel: "EMAIL_WHATSAPP", urgency: "HIGH",   action: "RESEND_PAYMENT_LINK", description: "Resend link (1 day)" },
    { level: 2, delayHours: 72,  channel: "EMAIL",          urgency: "CRITICAL", action: "ESCALATE_TO_HUMAN", description: "Escalate (3 days)" },
  ],
  CRITICAL: [
    { level: 0, delayHours: 0,   channel: "EMAIL",          urgency: "CRITICAL", action: "ESCALATE_TO_HUMAN", description: "Immediate human escalation" },
  ],
};

/**
 * Get the next retry action for a given risk level and current attempt count.
 */
export function getNextRetryAction(
  riskLevel: string,
  currentAttemptCount: number,
): RetrySchedule | null {
  const schedule = RETRY_SCHEDULES[riskLevel] || RETRY_SCHEDULES["MEDIUM"];
  const nextLevel = currentAttemptCount as RetryLevel;
  if (nextLevel >= schedule.length) return null;
  return schedule[nextLevel];
}

/**
 * Calculate the delay in hours until the next retry action.
 */
export function getRetryDelayHours(
  riskLevel: string,
  currentAttemptCount: number,
): number {
  const next = getNextRetryAction(riskLevel, currentAttemptCount);
  return next?.delayHours ?? 24;
}

/**
 * Get the full retry schedule for a risk level (for display/audit).
 */
export function getRetrySchedule(riskLevel: string): RetrySchedule[] {
  return RETRY_SCHEDULES[riskLevel] || RETRY_SCHEDULES["MEDIUM"];
}

/**
 * Check if a case has exhausted all retry levels.
 */
export function hasExhaustedRetries(
  riskLevel: string,
  currentAttemptCount: number,
): boolean {
  const schedule = RETRY_SCHEDULES[riskLevel] || RETRY_SCHEDULES["MEDIUM"];
  return currentAttemptCount >= schedule.length;
}

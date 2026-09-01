import type { AgentDecision, DecisionInput } from "./types";
import { callLlm } from "./llm-provider";
import { POLICY_LIMITS } from "../policy/engine";

/**
 * Deterministic fallback policy used when no LLM is configured or the LLM
 * output is invalid. Mirrors the recommendations a well-trained agent would
 * produce and guarantees the pipeline always returns a decision.
 */
function rulesDecision(input: DecisionInput): AgentDecision {
  const c = input.context;
  const risk = c.risk.riskLevel;
  const balance = c.invoice.balance;
  const daysOverdue = c.invoice.daysOverdue;
  const alreadyReminded = c.features.previousReminders > 0;
  const hasPaymentLink = input.priorActions.includes("CREATE_PAYMENT_LINK");
  const everReminded = input.priorActions.includes("SEND_REMINDER");

  // Learning loop: if we have trusted historical evidence for this segment,
  // prefer the proven strategy (unless the case is already paid/stopped).
  const learned = input.strategyStats?.byRiskLevel?.[risk];
  const learnedAction = (["SEND_REMINDER", "CREATE_PAYMENT_LINK", "RESEND_PAYMENT_LINK", "SCHEDULE_FOLLOWUP"] as const)
    .find((a) => a === learned);

  if (c.invoice.status === "Paid" || balance <= 0) {
    return {
      recommendedAction: "STOP",
      channel: "EMAIL",
      urgency: "LOW",
      reason: "Invoice is already paid; no recovery action is required.",
      confidence: 0.99,
      modelUsed: "rules",
    };
  }

  if (hasPaymentLink) {
    return {
      recommendedAction: "RESEND_PAYMENT_LINK",
      channel: "EMAIL",
      urgency: risk === "HIGH" ? "HIGH" : "MEDIUM",
      reason: "A payment link already exists for this invoice; resending is the lowest-friction next step.",
      confidence: 0.9,
      modelUsed: "rules",
    };
  }

  if (risk === "HIGH" || balance >= POLICY_LIMITS.autoMoneyLimit) {
    return {
      recommendedAction: "ESCALATE_TO_HUMAN",
      channel: "EMAIL",
      urgency: "HIGH",
      reason: "High risk or large balance requires human approval before any money action is taken.",
      confidence: 0.95,
      modelUsed: "rules",
    };
  }

  // Learned preference applies to the mid-funnel (non-link, non-escalation) path.
  if (learnedAction && !everReminded && !alreadyReminded) {
    return {
      recommendedAction: learnedAction,
      channel: "EMAIL",
      urgency: risk === "MEDIUM" ? "MEDIUM" : "LOW",
      reason: `Learning loop: "${learnedAction}" has the best conversion history for ${risk}-risk customers in this account.`,
      confidence: 0.82,
      modelUsed: "rules",
    };
  }

  if (risk === "MEDIUM" || everReminded) {
    return {
      recommendedAction: "CREATE_PAYMENT_LINK",
      channel: "EMAIL",
      urgency: "MEDIUM",
      reason: "Customer has a meaningful recovery probability; a payment link removes payment friction.",
      confidence: 0.85,
      modelUsed: "rules",
    };
  }

  if (daysOverdue >= 1 && !alreadyReminded) {
    return {
      recommendedAction: "SEND_REMINDER",
      channel: "EMAIL",
      urgency: "LOW",
      reason: "First touch for a low-risk customer; a friendly reminder is sufficient.",
      confidence: 0.9,
      modelUsed: "rules",
    };
  }

  return {
    recommendedAction: "SCHEDULE_FOLLOWUP",
    channel: "EMAIL",
    urgency: "LOW",
    reason: "Customer has been contacted; schedule a follow-up to re-engage later.",
    confidence: 0.8,
    modelUsed: "rules",
    suggestedFollowUpHours: 24,
  };
}

/**
 * Primary entrypoint: tries the LLM, validates it, and falls back to the
 * deterministic rules agent. The output is always a bounded, explainable
 * recommendation that must still pass the Policy Engine before execution.
 */
export async function decideRecoveryAction(input: DecisionInput): Promise<AgentDecision> {
  const useLlm = process.env.DISABLE_LLM_AGENT !== "true";

  if (useLlm) {
    const llmDecision = await callLlm(input.context, input.priorActions, input.strategyStats);
    if (llmDecision) return llmDecision;
  }

  return rulesDecision(input);
}

export { rulesDecision };
export type { AgentDecision } from "./types";
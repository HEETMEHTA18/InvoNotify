import type { RecoveryContext } from "../context";
import type { AgentDecision } from "./types";
import { isAllowedAction, isAllowedChannel, normalizeUrgency } from "./types";

export const LLM_ENDPOINT =
  process.env.LLM_BASE_URL ||
  process.env.LLAMAINDEX_BASE_URL ||
  "https://api.llamaindex.ai/v1";

export function isLlmConfigured() {
  return Boolean(
    process.env.LLAMAINDEX_API_KEY ||
      process.env.LLM_API_KEY ||
      process.env.OPENAI_API_KEY,
  );
}

function buildSystemPrompt(): string {
  return [
    "You are the recovery decision agent inside an invoice revenue-recovery system.",
    "You recommend ONE bounded action for a single overdue invoice. You never execute payments.",
    "Return STRICT JSON with EXACTLY these keys:",
    '{"recommendedAction":"SEND_REMINDER|CREATE_PAYMENT_LINK|RESEND_PAYMENT_LINK|SCHEDULE_FOLLOWUP|ESCALATE_TO_HUMAN|STOP",',
    '"channel":"EMAIL|SMS|BOTH","urgency":"LOW|MEDIUM|HIGH","reason":"<short human reason>",',
    '"confidence":0.0-1.0,"suggestedFollowUpHours":number}',
    "Rules:",
    "- Low risk, small balance -> SEND_REMINDER (EMAIL).",
    "- Medium risk or previously reminded once -> CREATE_PAYMENT_LINK (EMAIL).",
    "- Already has an active payment link -> RESEND_PAYMENT_LINK.",
    "- Customer needs a nudge later -> SCHEDULE_FOLLOWUP (set suggestedFollowUpHours).",
    "- Very high risk or large balance -> ESCALATE_TO_HUMAN.",
    "- Invoice paid or disputed -> STOP.",
    "Never invent new actions or channels.",
  ].join("\n");
}

function buildUserPrompt(context: RecoveryContext, priorActions: string[]): string {
  const c = context;
  return JSON.stringify(
    {
      invoice: {
        number: c.invoice.invoiceNumber,
        amountDue: c.invoice.balance,
        currency: c.invoice.currency,
        daysOverdue: c.invoice.daysOverdue,
        status: c.invoice.status,
        dueDate: c.invoice.dueDate,
      },
      customer: {
        name: c.customer.name,
        paymentSuccessRate: c.customer.paymentSuccessRate,
        averageDelayDays: c.customer.averagePaymentDelayDays,
        historyCount: c.customer.historyCount,
        isVipExempt: c.customer.isVipExempt,
        cibilScore: c.customer.cibilScore,
      },
      risk: {
        score: c.risk.riskScore,
        level: c.risk.riskLevel,
        paymentProbability: c.risk.paymentProbability,
        expectedRecovery: c.risk.expectedRecovery,
      },
      priorActions,
    },
    null,
    2,
  );
}

function parseLlmDecision(raw: string): AgentDecision | null {
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const data = JSON.parse(cleaned) as Record<string, unknown>;
    if (!isAllowedAction(data.recommendedAction)) return null;
    const channel = isAllowedChannel(data.channel) ? data.channel : "EMAIL";
    const confidence = Math.max(0, Math.min(1, Number(data.confidence) || 0.5));
    const followUp = Number(data.suggestedFollowUpHours);

    return {
      recommendedAction: data.recommendedAction,
      channel,
      urgency: normalizeUrgency(data.urgency),
      reason: String(data.reason || "LLM recommendation"),
      confidence,
      modelUsed: "llm",
      suggestedFollowUpHours: Number.isFinite(followUp) && followUp > 0 ? followUp : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Calls an OpenAI-compatible chat-completions endpoint (LlamaIndex / custom).
 * Returns null when the provider is unavailable or the output is invalid so
 * the caller can fall back to the deterministic rules agent.
 */
export async function callLlm(
  context: RecoveryContext,
  priorActions: string[],
  strategyStats?: { byRiskLevel: Record<string, string> },
): Promise<AgentDecision | null> {
  if (!isLlmConfigured()) return null;

  const apiKey =
    process.env.LLAMAINDEX_API_KEY || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.LLM_TIMEOUT_MS || 15000));

    const userPrompt = [
      buildUserPrompt(context, priorActions),
      strategyStats && Object.keys(strategyStats.byRiskLevel).length > 0
        ? `\n\nLearned strategy effectiveness for this account (prefer proven winners unless context clearly dictates otherwise):\n${JSON.stringify(strategyStats)}`
        : "",
    ].join("");

    const response = await fetch(`${LLM_ENDPOINT}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`LLM request failed (${response.status})`);
      return null;
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return null;

    return parseLlmDecision(content);
  } catch (error) {
    console.warn("LLM call failed, falling back to rules:", error);
    return null;
  }
}
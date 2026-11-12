import type { RecoveryContext } from "../context";
import type { TrustFinFeatures } from "./types";

/**
 * Deterministic, dependency-free feature extraction for the TrustFin verifier.
 *
 * TrustFin's own Phase-4B.1 features are FinQA-shaped: operand provenance,
 * question/evidence relevance, program operations and prompt truncation. A
 * recovery decision has no executable program, so the operation group is
 * explicitly zero rather than invented, and the provenance/relevance groups are
 * computed against the invoice record the agent actually saw. That mismatch is
 * why a served FinQA model must be mapped (TRUSTFIN_FEATURE_MAP) and validated
 * before anyone trusts its probabilities here — see docs/TRUSTFIN_INTEGRATION.md.
 */

export type GroundingReport = {
  /** Numeric claims the decision text makes (amounts, day counts, scores). */
  numericClaims: number;
  /** Claims traceable to a value in the invoice/customer record. */
  groundedClaims: number;
  /** Human-readable list of claims that are not in the record. */
  ungroundedClaims: string[];
  /** Fraction of claims that are grounded; 1 when there are none. */
  groundingRate: number;
};

export type TrustFinExtraction = {
  features: TrustFinFeatures;
  grounding: GroundingReport;
};

const NUMBER_PATTERN = /(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)/gi;

function parseNumericClaims(text: string): number[] {
  const claims: number[] = [];
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const parsed = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(parsed)) claims.push(parsed);
  }
  return claims;
}

/** Values the agent was given, so a claim can be checked against them. */
function evidenceValues(context: RecoveryContext): number[] {
  const { invoice, customer, risk } = context;
  return [
    invoice.total,
    invoice.amountPaid,
    invoice.balance,
    invoice.daysOverdue,
    customer.previousInvoiceCount,
    customer.previousLatePayments,
    customer.averagePaymentDelayDays,
    customer.customerAgeDays,
    customer.paymentSuccessRate,
    customer.paymentSuccessRate * 100,
    customer.cibilScore ?? 0,
    risk.riskScore,
    risk.riskScore * 100,
    risk.paymentProbability,
    risk.paymentProbability * 100,
    risk.expectedRecovery,
  ].filter((value) => Number.isFinite(value));
}

/** Tolerance so ₹49,999.6 rendered as "₹50,000" still counts as grounded. */
function isGrounded(claim: number, values: number[]): boolean {
  return values.some((value) => Math.abs(value - claim) <= Math.max(1, Math.abs(value) * 0.01));
}

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 3);
}

function overlapRatio(sourceTokens: string[], targetTokens: Set<string>): number {
  if (sourceTokens.length === 0) return 0;
  const hits = sourceTokens.filter((token) => targetTokens.has(token)).length;
  return hits / sourceTokens.length;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function extractTrustFinFeatures(args: {
  context: RecoveryContext;
  decisionReason: string;
  /** Approximate prompt length in characters, when the caller knows it. */
  promptLength?: number;
}): TrustFinExtraction {
  const { context, decisionReason } = args;
  const values = evidenceValues(context);
  const claims = parseNumericClaims(decisionReason);
  const ungrounded = claims.filter((claim) => !isGrounded(claim, values));

  const evidenceText = [
    context.invoice.invoiceNumber,
    context.invoice.clientName,
    context.invoice.status,
    context.customer.name,
  ]
    .filter(Boolean)
    .join(" ");
  const evidenceTokens = new Set(tokenise(evidenceText));
  const reasonTokens = tokenise(decisionReason);

  const numericClaims = claims.length;
  const groundedClaims = numericClaims - ungrounded.length;
  const groundingRate = numericClaims === 0 ? 1 : groundedClaims / numericClaims;
  const promptLength = args.promptLength ?? decisionReason.length;

  return {
    grounding: {
      numericClaims,
      groundedClaims,
      ungroundedClaims: ungrounded.map((value) => String(value)),
      groundingRate: round(groundingRate),
    },
    features: {
      // Provenance group — does the decision cite only numbers it was given?
      amountClaims: numericClaims,
      ungroundedClaims: ungrounded.length,
      groundingRate: round(groundingRate),
      // Relevance group — does the text use the record's own vocabulary?
      evidenceTokenOverlap: round(overlapRatio(reasonTokens, evidenceTokens)),
      reasonTokens: reasonTokens.length,
      // Operations group — no executable program exists for this decision.
      programSteps: 0,
      hasExecutableProgram: 0,
      // Truncation group.
      promptLength,
      truncated: promptLength > 2048 ? 1 : 0,
    },
  };
}

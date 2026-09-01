export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type ModelVersion = {
  name: string;
  trainedAt: string;
  source: "heuristic-calibration" | "trained";
};

export type ModelWeights = {
  version: ModelVersion;
  intercept: number;
  /** Weights applied to normalized features. Keys match `RawFeatures`. */
  weights: Record<string, number>;
};

export type RawFeatures = {
  /** Invoice balance due (the amount we want to recover), in minor units scaled to INR. */
  amountDue: number;
  /** Whole days past the due date. */
  daysOverdue: number;
  /** Days since the customer's first invoice. */
  customerAgeDays: number;
  /** Total historical invoices (excluding the current one). */
  previousInvoiceCount: number;
  /** Historical invoices that were paid late. */
  previousLatePayments: number;
  /** Average payment delay in days across history. */
  averagePaymentDelayDays: number;
  /** Fraction of historical invoices paid on time (0..1). */
  paymentSuccessRate: number;
  /** Number of reminders already sent for this invoice. */
  previousReminders: number;
  /** Whether the customer is flagged VIP/exempt. */
  isVipExempt: boolean;
  /** Optional credit score (e.g. CIBIL) 300..900. */
  cibilScore: number;
  /** True when a human already approved/engaged this case. */
  humanEngaged: boolean;
};

export type NormalizedFeatures = Record<string, number>;

export type RiskScore = {
  /** Higher = riskier (more likely to pay late or default). 0..1 */
  riskScore: number;
  /** Probability the invoice eventually gets paid. 0..1 */
  paymentProbability: number;
  /** Expected recoverable amount = balance * paymentProbability. */
  expectedRecovery: number;
  /** Absolute amount due at scoring time. */
  amountDue: number;
  riskLevel: RiskLevel;
  /** Per-feature contribution to the log-odds (for explainability). */
  contributions: Array<{
    feature: string;
    value: number;
    contribution: number;
  }>;
  modelVersion: ModelVersion;
};

export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 0.7) return "HIGH";
  if (score >= 0.4) return "MEDIUM";
  return "LOW";
}
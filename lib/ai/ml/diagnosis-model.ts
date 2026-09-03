/**
 * ML-enhanced failure diagnosis model.
 *
 * Upgrades the static taxonomy lookup with weighted feature scoring.
 * Uses a logistic regression approach to predict the most likely root cause
 * based on multiple signals: failure code, payment history, customer profile,
 * amount, and timing.
 */

export type DiagnosisFeature = {
  /** Normalized failure code category (0-1) */
  failureCodeCategory: number;
  /** Days overdue (normalized 0-1, max 90 days) */
  daysOverdue: number;
  /** Amount due normalized (log scale) */
  amountNormalized: number;
  /** Customer payment success rate (0-1) */
  paymentSuccessRate: number;
  /** Number of previous failed attempts */
  previousFailures: number;
  /** CIBIL score normalized (0-1) */
  cibilScoreNormalized: number;
  /** Is first invoice for this customer */
  isFirstInvoice: number;
  /** Has mandate/NACH setup */
  hasMandate: number;
  /** Payment method risk (0=low, 1=high) */
  paymentMethodRisk: number;
};

export type DiagnosisResult = {
  /** Most likely root cause category */
  category: string;
  /** Specific diagnosis code */
  code: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** All candidate causes with scores */
  candidates: Array<{
    category: string;
    code: string;
    score: number;
    confidence: number;
  }>;
  /** Feature contributions for explainability */
  contributions: Array<{
    feature: string;
    value: number;
    contribution: number;
  }>;
  modelVersion: string;
};

/**
 * Diagnosis model weights — trained on historical failure patterns.
 * Each weight represents how strongly a feature predicts a specific failure category.
 */
const DIAGNOSIS_WEIGHTS: Record<
  string,
  {
    intercept: number;
    weights: Record<string, number>;
  }
> = {
  PAYMENT_FAILURE: {
    intercept: -1.2,
    weights: {
      failureCodeCategory: 2.5,
      daysOverdue: 0.8,
      amountNormalized: 0.3,
      paymentSuccessRate: -1.8,
      previousFailures: 1.5,
      cibilScoreNormalized: -0.6,
      isFirstInvoice: 0.2,
      hasMandate: -1.0,
      paymentMethodRisk: 1.2,
    },
  },
  MANDATE_FAILURE: {
    intercept: -2.0,
    weights: {
      failureCodeCategory: 3.0,
      daysOverdue: 0.4,
      amountNormalized: 0.1,
      paymentSuccessRate: -0.5,
      previousFailures: 0.8,
      cibilScoreNormalized: -0.3,
      isFirstInvoice: 0.5,
      hasMandate: 2.0,
      paymentMethodRisk: 0.3,
    },
  },
  CHECKOUT_ABANDONMENT: {
    intercept: -1.5,
    weights: {
      failureCodeCategory: 2.0,
      daysOverdue: -0.3,
      amountNormalized: 1.2,
      paymentSuccessRate: -0.8,
      previousFailures: 0.3,
      cibilScoreNormalized: -0.2,
      isFirstInvoice: 0.8,
      hasMandate: -0.5,
      paymentMethodRisk: 0.6,
    },
  },
  OVERDUE_RECEIVABLE: {
    intercept: -0.8,
    weights: {
      failureCodeCategory: 0.5,
      daysOverdue: 2.2,
      amountNormalized: 0.6,
      paymentSuccessRate: -1.5,
      previousFailures: 1.0,
      cibilScoreNormalized: -1.0,
      isFirstInvoice: -0.3,
      hasMandate: -0.2,
      paymentMethodRisk: 0.1,
    },
  },
  BANKING_ISSUE: {
    intercept: -2.5,
    weights: {
      failureCodeCategory: 1.5,
      daysOverdue: 0.2,
      amountNormalized: 0.4,
      paymentSuccessRate: -0.3,
      previousFailures: 2.0,
      cibilScoreNormalized: -0.1,
      isFirstInvoice: 0.1,
      hasMandate: 0.8,
      paymentMethodRisk: 1.5,
    },
  },
  TECHNICAL: {
    intercept: -3.0,
    weights: {
      failureCodeCategory: 1.8,
      daysOverdue: -0.1,
      amountNormalized: 0.2,
      paymentSuccessRate: -0.2,
      previousFailures: 0.5,
      cibilScoreNormalized: 0.0,
      isFirstInvoice: 0.3,
      hasMandate: 0.1,
      paymentMethodRisk: 0.8,
    },
  },
};

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/**
 * Normalize a failure code to a category feature.
 */
function normalizeFailureCode(failureCode: string | null): number {
  if (!failureCode) return 0.5;

  const code = failureCode.toUpperCase();

  // Payment failure codes: high risk
  if (code.includes("PAYMENT") || code.includes("INSUFFICIENT") || code.includes("DECLINED")) {
    return 0.9;
  }
  // Mandate/NACH failure
  if (code.includes("MANDATE") || code.includes("NACH") || code.includes("ECS")) {
    return 0.8;
  }
  // Banking issues
  if (code.includes("BANK") || code.includes("ACCOUNT") || code.includes("IFSC")) {
    return 0.7;
  }
  // Checkout abandonment
  if (code.includes("CHECKOUT") || code.includes("ABANDON") || code.includes("TIMEOUT")) {
    return 0.6;
  }
  // Technical errors
  if (code.includes("TECH") || code.includes("SYSTEM") || code.includes("GATEWAY")) {
    return 0.4;
  }

  return 0.5; // Unknown
}

/**
 * Determine payment method risk level.
 */
function paymentMethodRisk(method: string | null): number {
  if (!method) return 0.5;

  const m = method.toLowerCase();
  if (m.includes("upi") || m.includes("netbanking")) return 0.2;
  if (m.includes("card") || m.includes("credit") || m.includes("debit")) return 0.4;
  if (m.includes("wallet")) return 0.3;
  if (m.includes("cod") || m.includes("cash")) return 0.8;
  if (m.includes("emandate") || m.includes("nach")) return 0.1;

  return 0.5;
}

/**
 * Build feature vector from raw diagnosis inputs.
 */
function buildFeatures(input: {
  failureCode: string | null;
  daysOverdue: number;
  amountDue: number;
  paymentSuccessRate: number;
  previousFailures: number;
  cibilScore: number;
  totalInvoiceCount: number;
  hasMandate: boolean;
  paymentMethod: string | null;
}): DiagnosisFeature {
  return {
    failureCodeCategory: normalizeFailureCode(input.failureCode),
    daysOverdue: Math.min(1, Math.max(0, input.daysOverdue / 90)),
    amountNormalized: Math.min(1, Math.log1p(Math.max(0, input.amountDue)) / Math.log1p(100000)),
    paymentSuccessRate: Math.max(0, Math.min(1, input.paymentSuccessRate)),
    previousFailures: Math.min(1, input.previousFailures / 10),
    cibilScoreNormalized: Math.max(0, Math.min(1, (input.cibilScore - 300) / 600)),
    isFirstInvoice: input.totalInvoiceCount <= 1 ? 1 : 0,
    hasMandate: input.hasMandate ? 1 : 0,
    paymentMethodRisk: paymentMethodRisk(input.paymentMethod),
  };
}

/**
 * Score a single failure category using logistic regression.
 */
function scoreCategory(
  category: string,
  features: DiagnosisFeature,
): { score: number; contributions: Array<{ feature: string; value: number; contribution: number }> } {
  const model = DIAGNOSIS_WEIGHTS[category];
  if (!model) return { score: 0, contributions: [] };

  let logOdds = model.intercept;
  const contributions: Array<{ feature: string; value: number; contribution: number }> = [];

  for (const [feature, weight] of Object.entries(model.weights)) {
    const value = (features as Record<string, number>)[feature] ?? 0;
    const contribution = weight * value;
    logOdds += contribution;
    contributions.push({ feature, value, contribution });
  }

  return {
    score: sigmoid(logOdds),
    contributions: contributions.sort((a, b) => b.contribution - a.contribution),
  };
}

/**
 * Run ML diagnosis on a failure case.
 *
 * Replaces the static taxonomy lookup with weighted feature scoring
 * that considers multiple signals simultaneously.
 */
export function diagnoseFailure(input: {
  failureCode: string | null;
  failureReason: string | null;
  daysOverdue: number;
  amountDue: number;
  paymentSuccessRate: number;
  previousFailures: number;
  cibilScore: number;
  totalInvoiceCount: number;
  hasMandate: boolean;
  paymentMethod: string | null;
}): DiagnosisResult {
  const features = buildFeatures(input);

  // Score all categories
  const candidates = Object.keys(DIAGNOSIS_WEIGHTS).map((category) => {
    const { score, contributions } = scoreCategory(category, features);
    return {
      category,
      code: `${category}_PREDICTED`,
      score,
      confidence: score,
      contributions,
    };
  });

  // Sort by score (highest first)
  candidates.sort((a, b) => b.score - a.score);

  const topCandidate = candidates[0];

  // Get contributions from the top candidate
  const topContributions = candidates[0]?.contributions || [];

  // Adjust confidence based on margin between top candidates
  const margin = candidates.length > 1 ? candidates[0].score - candidates[1].score : 1;
  const adjustedConfidence = Math.min(
    0.99,
    topCandidate.score * (0.7 + 0.3 * Math.min(1, margin * 2)),
  );

  return {
    category: topCandidate.category,
    code: topCandidate.code,
    confidence: Number(adjustedConfidence.toFixed(4)),
    candidates: candidates.map((c) => ({
      category: c.category,
      code: c.code,
      score: Number(c.score.toFixed(4)),
      confidence: Number(c.confidence.toFixed(4)),
    })),
    contributions: topContributions,
    modelVersion: "diagnosis-ml-v1",
  };
}

/**
 * Map ML prediction to a specific failure code from the taxonomy.
 */
export function mapToTaxonomyCode(category: string): string {
  const mapping: Record<string, string> = {
    PAYMENT_FAILURE: "PAYMENT_INSUFFICIENT_FUNDS",
    MANDATE_FAILURE: "MANDATE_CANCELLED",
    CHECKOUT_ABANDONMENT: "CHECKOUT_ABANDONED",
    OVERDUE_RECEIVABLE: "OVERDUE_ACCOUNT_DEBITOR",
    BANKING_ISSUE: "BANK_ACCOUNT_INVALID",
    TECHNICAL: "TECHNICAL_GATEWAY_TIMEOUT",
  };
  return mapping[category] || "UNKNOWN";
}

import type {
  ModelWeights,
  RawFeatures,
  RiskScore,
  NormalizedFeatures,
} from "./types";
import { riskLevelFromScore } from "./types";
import { normalizeFeatures } from "./features";
import modelWeights from "./model-weights.json";

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

function loadWeights(): ModelWeights {
  return modelWeights as unknown as ModelWeights;
}

/**
 * Logistic-regression style payment risk scorer.
 *
 * score = sigmoid(intercept + Σ w_i * x_i)
 * paymentProbability = 1 - riskScore
 * expectedRecovery = balance * paymentProbability
 *
 * Weights live in `model-weights.json` so a training pipeline
 * (see ai/ml/training/train.py) can re-calibrate them without
 * touching inference code.
 */
export function scoreRisk(raw: RawFeatures): RiskScore {
  const features: NormalizedFeatures = normalizeFeatures(raw);
  const model = loadWeights();
  const intercept = model.intercept;

  const contributions: Array<{ feature: string; value: number; contribution: number }> = [];
  let logOdds = intercept;

  for (const [feature, weight] of Object.entries(model.weights)) {
    const value = features[feature] ?? 0;
    const contribution = weight * value;
    logOdds += contribution;
    contributions.push({ feature, value, contribution });
  }

  const riskScore = sigmoid(logOdds);
  const paymentProbability = 1 - riskScore;
  const amountDue = Math.max(0, raw.amountDue);
  const expectedRecovery = Number((amountDue * paymentProbability).toFixed(2));

  return {
    riskScore: Number(riskScore.toFixed(4)),
    paymentProbability: Number(paymentProbability.toFixed(4)),
    expectedRecovery,
    amountDue,
    riskLevel: riskLevelFromScore(riskScore),
    contributions: contributions.sort((a, b) => b.contribution - a.contribution),
    modelVersion: model.version,
  };
}

export function getModelVersion() {
  return loadWeights().version;
}

export { riskLevelFromScore } from "./types";
export type { RawFeatures, RiskScore } from "./types";
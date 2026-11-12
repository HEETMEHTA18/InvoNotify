import { z } from "zod";

/**
 * TrustFin-SLM integration types.
 *
 * Source model: https://github.com/HEETMEHTA18/trust_fin — Phase-4B.1
 * "fit-only" logistic risk estimator (`I9_fit_only_selected.joblib`). That model
 * predicts when an executable financial program is likely to be wrong, and it
 * ships with calibration and selective-prediction (abstain) semantics.
 *
 * In InvoNotify it is used only as a *verifier* of an already-approved recovery
 * decision: the deterministic policy engine stays the sole authority on money,
 * consent and stopping rules, and a verifier can only tighten an ALLOW into
 * "ask a human".
 */

/** Numeric feature vector sent to the verifier. Keys are stable and documented. */
export const trustFinFeaturesSchema = z.record(z.string(), z.number().finite());
export type TrustFinFeatures = z.infer<typeof trustFinFeaturesSchema>;

/** Response contract of `services/trustfin` (or any compatible deployment). */
export const trustFinResponseSchema = z.object({
  risk: z.number().min(0).max(1),
  abstain: z.boolean().optional(),
  threshold: z.number().min(0).max(1).optional(),
  modelVersion: z.string().optional(),
  decision: z.enum(["ACCEPT", "REVIEW"]).optional(),
});
export type TrustFinRemoteAssessment = z.infer<typeof trustFinResponseSchema>;

/** Request contract. `features` is mapped by the server via TRUSTFIN_FEATURE_MAP. */
export const trustFinRequestSchema = z.object({
  features: trustFinFeaturesSchema,
  threshold: z.number().min(0).max(1).optional(),
  modelVersion: z.string().optional(),
});
export type TrustFinRequest = z.infer<typeof trustFinRequestSchema>;

export type TrustFinSource = "remote" | "unavailable" | "disabled";

/** What gets persisted for audit, whatever the verifier said. */
export type TrustFinAuditRecord = {
  source: TrustFinSource;
  risk: number | null;
  threshold: number | null;
  abstained: boolean;
  modelVersion: string | null;
  verdict: "ALLOW" | "REQUIRE_HUMAN_APPROVAL";
  reasons: string[];
  features: TrustFinFeatures;
};

export type TrustFinVerification = {
  decision: "ALLOW" | "REQUIRE_HUMAN_APPROVAL";
  reasons: string[];
  /** null when the integration is disabled — nothing is persisted then. */
  audit: TrustFinAuditRecord | null;
};

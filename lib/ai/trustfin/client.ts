import type { RecoveryContext } from "../context";
import type { AgentDecision } from "../agent/types";
import { getTrustFinConfig } from "../config";
import { createLogger } from "../logger";
import { extractTrustFinFeatures } from "./features";
import { buildTrustFinAuditRecord, evaluateTrustFinGate } from "./gate";
import {
  trustFinResponseSchema,
  type TrustFinFeatures,
  type TrustFinVerification,
} from "./types";

const log = createLogger("ai:trustfin");

/**
 * Calls a TrustFin risk-estimator deployment and turns its answer into a gate
 * verdict. Every failure mode (not configured, timeout, bad JSON, 4xx/5xx) is
 * explicit: the gate then falls back to the existing policy decision, or to
 * human review when TRUSTFIN_REQUIRED=true. Nothing here can widen autonomy.
 */
export async function verifyWithTrustFin(args: {
  context: RecoveryContext;
  decision: AgentDecision;
}): Promise<TrustFinVerification> {
  const config = getTrustFinConfig();
  const extraction = extractTrustFinFeatures({
    context: args.context,
    decisionReason: args.decision.reason,
  });

  if (!config.url) {
    return { decision: "ALLOW", reasons: ["TrustFin verifier disabled"], audit: null };
  }

  const assessment = await requestAssessment({
    url: config.url,
    features: extraction.features,
    threshold: config.threshold,
    timeoutMs: config.timeoutMs,
    modelVersion: config.modelVersion,
  });

  const remote = assessment.ok ? assessment.value : null;
  const gate = evaluateTrustFinGate({
    action: args.decision.recommendedAction,
    assessment: remote
      ? {
          risk: remote.risk,
          abstained: Boolean(remote.abstain),
          threshold: remote.threshold ?? config.threshold,
          modelVersion: remote.modelVersion ?? config.modelVersion,
        }
      : null,
    source: assessment.ok ? "remote" : "unavailable",
    required: config.required,
    requireGrounding: config.requireGrounding,
    grounding: extraction.grounding,
  });

  const audit = buildTrustFinAuditRecord({
    source: assessment.ok ? "remote" : "unavailable",
    risk: assessment.ok ? assessment.value.risk : null,
    threshold: assessment.ok
      ? assessment.value.threshold ?? config.threshold
      : config.threshold,
    abstained: assessment.ok ? Boolean(assessment.value.abstain) : false,
    modelVersion: assessment.ok
      ? assessment.value.modelVersion ?? config.modelVersion
      : config.modelVersion,
    verdict: gate,
    reasons: gate.reasons,
    grounding: extraction.grounding,
    features: extraction.features,
  });

  return { decision: gate.decision, reasons: gate.reasons, audit };
}

type AssessmentResult =
  | { ok: true; value: { risk: number; abstain?: boolean; threshold?: number; modelVersion?: string } }
  | { ok: false; error: string };

async function requestAssessment(args: {
  url: string;
  features: TrustFinFeatures;
  threshold: number;
  timeoutMs: number;
  modelVersion: string | null;
}): Promise<AssessmentResult> {
  const endpoint = `${args.url.replace(/\/+$/, "")}/v1/assess`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        features: args.features,
        threshold: args.threshold,
        ...(args.modelVersion ? { modelVersion: args.modelVersion } : {}),
      }),
      signal: AbortSignal.timeout(args.timeoutMs),
    });

    if (!response.ok) {
      // A 422 here is the documented "feature contract mismatch" case; log it
      // loudly because it means the served model expects different inputs.
      const body = await response.text().catch(() => "");
      const error = `TrustFin returned ${response.status}: ${body.slice(0, 300)}`;
      log.warn("TrustFin assessment rejected", { status: response.status, endpoint });
      return { ok: false, error };
    }

    const parsed = trustFinResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      log.warn("TrustFin response failed schema validation", {
        issues: parsed.error.issues.map((issue) => issue.path.join(".")),
      });
      return { ok: false, error: "Invalid TrustFin response shape" };
    }
    return { ok: true, value: parsed.data };
  } catch (error) {
    log.warn("TrustFin assessment failed", {
      endpoint,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: "TrustFin request failed" };
  }
}

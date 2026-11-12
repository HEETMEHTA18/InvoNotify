import { CONTACT_ACTIONS } from "../policy/engine";
import type { GroundingReport } from "./features";
import type { TrustFinAuditRecord, TrustFinSource } from "./types";

/**
 * Pure gate between the deterministic policy verdict and action execution.
 *
 * Invariants:
 *   - It can only turn an ALLOW into REQUIRE_HUMAN_APPROVAL. A BLOCK is never
 *     revisited here, so an unavailable or misconfigured verifier can never
 *     unlock a money or contact action.
 *   - Non-contact actions (STOP, ESCALATE_TO_HUMAN, SCHEDULE_FOLLOWUP) are out
 *     of scope: there is nothing to verify and nothing reaches the customer.
 */
export type TrustFinGateInput = {
  action: string;
  /** Null when no verifier response exists. */
  assessment: {
    risk: number | null;
    abstained: boolean;
    threshold: number | null;
    modelVersion: string | null;
  } | null;
  source: TrustFinSource;
  /** When true, an unavailable verifier forces human review. */
  required: boolean;
  /** When true, ungrounded numeric claims force human review. */
  requireGrounding: boolean;
  grounding: GroundingReport;
};

export type TrustFinGateVerdict = {
  decision: "ALLOW" | "REQUIRE_HUMAN_APPROVAL";
  reasons: string[];
};

export function evaluateTrustFinGate(input: TrustFinGateInput): TrustFinGateVerdict {
  const action = input.action as (typeof CONTACT_ACTIONS)[number];
  if (!CONTACT_ACTIONS.includes(action)) {
    return { decision: "ALLOW", reasons: ["TrustFin verification not required for this action"] };
  }

  const reasons: string[] = [];

  if (input.source !== "remote" || !input.assessment) {
    if (input.required) {
      return {
        decision: "REQUIRE_HUMAN_APPROVAL",
        reasons: [
          "TrustFin verifier is required but unavailable; refusing autonomous customer contact",
        ],
      };
    }
    return {
      decision: "ALLOW",
      reasons: ["TrustFin verifier not configured or unreachable; existing policy decision stands"],
    };
  }

  const { risk, abstained, threshold } = input.assessment;

  if (abstained) {
    return {
      decision: "REQUIRE_HUMAN_APPROVAL",
      reasons: ["TrustFin verifier abstained: risk is outside its calibrated confidence band"],
    };
  }

  if (risk !== null && threshold !== null && risk >= threshold) {
    return {
      decision: "REQUIRE_HUMAN_APPROVAL",
      reasons: [
        `TrustFin risk ${risk.toFixed(3)} is at or above the review threshold ${threshold.toFixed(3)}`,
      ],
    };
  }

  if (input.requireGrounding && input.grounding.ungroundedClaims.length > 0) {
    return {
      decision: "REQUIRE_HUMAN_APPROVAL",
      reasons: [
        `Decision cites ${input.grounding.ungroundedClaims.length} numeric claim(s) absent from the invoice record`,
      ],
    };
  }

  reasons.push(
    risk === null || threshold === null
      ? "TrustFin verifier returned no usable risk value; policy decision stands"
      : `TrustFin risk ${risk.toFixed(3)} is below the review threshold ${threshold.toFixed(3)}`,
  );
  return { decision: "ALLOW", reasons };
}

/** Audit record builder, kept separate so the gate stays free of DB/IO shapes. */
export function buildTrustFinAuditRecord(args: {
  source: TrustFinSource;
  risk: number | null;
  threshold: number | null;
  abstained: boolean;
  modelVersion: string | null;
  verdict: TrustFinGateVerdict;
  reasons: string[];
  grounding: GroundingReport;
  features: Record<string, number>;
}): TrustFinAuditRecord | null {
  if (args.source === "disabled") return null;
  return {
    source: args.source,
    risk: args.risk,
    threshold: args.threshold,
    abstained: args.abstained,
    modelVersion: args.modelVersion,
    verdict: args.verdict.decision,
    reasons: args.reasons,
    features: args.features,
  };
}

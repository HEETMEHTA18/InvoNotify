import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractTrustFinFeatures } from "../../lib/ai/trustfin/features";
import { buildTrustFinAuditRecord, evaluateTrustFinGate } from "../../lib/ai/trustfin/gate";
import type { RecoveryContext } from "../../lib/ai/context";

function context(overrides: { balance?: number; daysOverdue?: number } = {}) {
  return {
    invoice: {
      id: 1,
      invoiceNumber: "INV-0042",
      clientName: "Acme Traders",
      clientEmail: "ap@acme.test",
      clientPhone: null,
      total: 50_000,
      amountPaid: 0,
      balance: overrides.balance ?? 50_000,
      currency: "INR",
      status: "Overdue",
      dueDate: new Date("2026-10-01T00:00:00Z"),
      daysOverdue: overrides.daysOverdue ?? 42,
      customerId: 7,
    },
    customer: {
      id: 7,
      name: "Acme Traders",
      email: "ap@acme.test",
      isVipExempt: false,
      communicationOptOut: false,
      cibilScore: 720,
      previousInvoiceCount: 9,
      previousLatePayments: 2,
      averagePaymentDelayDays: 6,
      paymentSuccessRate: 0.8,
      customerAgeDays: 400,
      historyCount: 9,
      contactWindow: null,
    },
    risk: {
      riskScore: 0.62,
      paymentProbability: 0.38,
      expectedRecovery: 19_000,
      riskLevel: "MEDIUM",
      contributions: [],
    },
    features: {},
  } as unknown as RecoveryContext;
}

describe("TrustFin feature extraction", () => {
  it("grounds an amount that appears in the invoice record", () => {
    const { features, grounding } = extractTrustFinFeatures({
      context: context(),
      decisionReason: "Balance of ₹50,000 is 42 days overdue; expected recovery ₹19,000.",
    });

    assert.equal(grounding.numericClaims, 3);
    assert.equal(grounding.ungroundedClaims.length, 0);
    assert.equal(grounding.groundingRate, 1);
    assert.equal(features.ungroundedClaims, 0);
    assert.ok(features.evidenceTokenOverlap > 0);
  });

  it("flags an amount the agent was never given", () => {
    const { grounding } = extractTrustFinFeatures({
      context: context(),
      decisionReason: "Customer owes ₹7,77,777 and has ignored 12 reminders.",
    });

    assert.ok(grounding.numericClaims >= 2);
    assert.ok(grounding.ungroundedClaims.includes("777777"));
    assert.ok(grounding.groundingRate < 1);
  });

  it("treats text with no numbers as fully grounded", () => {
    const { grounding, features } = extractTrustFinFeatures({
      context: context(),
      decisionReason: "Customer is a reliable payer; send a polite reminder.",
    });

    assert.equal(grounding.numericClaims, 0);
    assert.equal(grounding.groundingRate, 1);
    assert.equal(features.programSteps, 0);
    assert.equal(features.hasExecutableProgram, 0);
  });

  it("marks long prompts as truncated", () => {
    const { features } = extractTrustFinFeatures({
      context: context(),
      decisionReason: "x".repeat(3000),
      promptLength: 3000,
    });
    assert.equal(features.truncated, 1);
    assert.equal(features.promptLength, 3000);
  });
});

describe("TrustFin gate", () => {
  const grounded = { numericClaims: 1, groundedClaims: 1, ungroundedClaims: [], groundingRate: 1 };
  const ungrounded = {
    numericClaims: 2,
    groundedClaims: 1,
    ungroundedClaims: ["777777"],
    groundingRate: 0.5,
  };

  it("never verifies a non-contact action", () => {
    const verdict = evaluateTrustFinGate({
      action: "ESCALATE_TO_HUMAN",
      assessment: null,
      source: "disabled",
      required: true,
      requireGrounding: true,
      grounding: ungrounded,
    });
    assert.equal(verdict.decision, "ALLOW");
  });

  it("lets the policy decision stand when the verifier is unavailable and not required", () => {
    const verdict = evaluateTrustFinGate({
      action: "SEND_REMINDER",
      assessment: null,
      source: "unavailable",
      required: false,
      requireGrounding: false,
      grounding: grounded,
    });
    assert.equal(verdict.decision, "ALLOW");
    assert.match(verdict.reasons.join(" "), /not configured or unreachable/);
  });

  it("forces human review when a required verifier is unavailable", () => {
    const verdict = evaluateTrustFinGate({
      action: "CREATE_PAYMENT_LINK",
      assessment: null,
      source: "unavailable",
      required: true,
      requireGrounding: false,
      grounding: grounded,
    });
    assert.equal(verdict.decision, "REQUIRE_HUMAN_APPROVAL");
  });

  it("forces human review at or above the threshold", () => {
    const verdict = evaluateTrustFinGate({
      action: "CREATE_PAYMENT_LINK",
      assessment: { risk: 0.5, abstained: false, threshold: 0.5, modelVersion: "m" },
      source: "remote",
      required: false,
      requireGrounding: false,
      grounding: grounded,
    });
    assert.equal(verdict.decision, "REQUIRE_HUMAN_APPROVAL");
    assert.match(verdict.reasons.join(" "), /at or above the review threshold/);
  });

  it("allows a low-risk decision and explains why", () => {
    const verdict = evaluateTrustFinGate({
      action: "SEND_REMINDER",
      assessment: { risk: 0.12, abstained: false, threshold: 0.5, modelVersion: "m" },
      source: "remote",
      required: false,
      requireGrounding: false,
      grounding: ungrounded,
    });
    assert.equal(verdict.decision, "ALLOW");
    assert.match(verdict.reasons.join(" "), /below the review threshold/);
  });

  it("honours an abstention as a request for a human", () => {
    const verdict = evaluateTrustFinGate({
      action: "SEND_REMINDER",
      assessment: { risk: 0.2, abstained: true, threshold: 0.5, modelVersion: "m" },
      source: "remote",
      required: false,
      requireGrounding: false,
      grounding: grounded,
    });
    assert.equal(verdict.decision, "REQUIRE_HUMAN_APPROVAL");
    assert.match(verdict.reasons.join(" "), /abstained/);
  });

  it("enforces grounding only when explicitly enabled", () => {
    const base = {
      action: "SEND_REMINDER",
      assessment: { risk: 0.1, abstained: false, threshold: 0.5, modelVersion: "m" },
      source: "remote" as const,
      required: false,
      grounding: ungrounded,
    };

    assert.equal(evaluateTrustFinGate({ ...base, requireGrounding: false }).decision, "ALLOW");
    assert.equal(
      evaluateTrustFinGate({ ...base, requireGrounding: true }).decision,
      "REQUIRE_HUMAN_APPROVAL",
    );
  });
});

describe("TrustFin audit record", () => {
  it("persists nothing when the integration is disabled", () => {
    const audit = buildTrustFinAuditRecord({
      source: "disabled",
      risk: null,
      threshold: null,
      abstained: false,
      modelVersion: null,
      verdict: { decision: "ALLOW", reasons: ["disabled"] },
      reasons: ["disabled"],
      grounding: { numericClaims: 0, groundedClaims: 0, ungroundedClaims: [], groundingRate: 1 },
      features: { amountClaims: 0 },
    });
    assert.equal(audit, null);
  });

  it("records an unavailable verifier so the gap stays visible", () => {
    const audit = buildTrustFinAuditRecord({
      source: "unavailable",
      risk: null,
      threshold: 0.5,
      abstained: false,
      modelVersion: null,
      verdict: { decision: "ALLOW", reasons: ["unreachable"] },
      reasons: ["unreachable"],
      grounding: { numericClaims: 0, groundedClaims: 0, ungroundedClaims: [], groundingRate: 1 },
      features: { amountClaims: 0 },
    });

    assert.ok(audit);
    assert.equal(audit.source, "unavailable");
    assert.equal(audit.verdict, "ALLOW");
  });
});

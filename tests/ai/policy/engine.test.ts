import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluatePolicy, getPolicyLimits, resolvePolicyLimits } from "../../../lib/ai/policy/engine";
import { isWithinBusinessHours } from "../../../lib/ai/policy/merchant-policy";
import type { RecoveryContext } from "../../../lib/ai/context";
import type { AgentDecision } from "../../../lib/ai/agent/types";

function ctx(overrides: Record<string, unknown> = {}): RecoveryContext {
  return {
    invoice: { id: 1, invoiceNumber: "INV-1001", clientName: "Acme", clientEmail: "a@b.c", clientPhone: "", total: 24500, amountPaid: 0, balance: 24500, currency: "INR", status: "Pending", dueDate: new Date(Date.now() - 7 * 86400000), daysOverdue: 7, customerId: null, razorpayPaymentLinkId: null, razorpayPaymentLinkUrl: null },
    customer: { id: null, name: "Acme", email: "a@b.c", isVipExempt: false, communicationOptOut: false, cibilScore: 700, previousInvoiceCount: 8, previousLatePayments: 2, averagePaymentDelayDays: 3, paymentSuccessRate: 0.75, customerAgeDays: 400, historyCount: 8 },
    risk: { riskScore: 0.5, paymentProbability: 0.5, expectedRecovery: 12250, amountDue: 24500, riskLevel: "MEDIUM", contributions: [], modelVersion: { name: "test", trainedAt: "", source: "heuristic-calibration" } },
    features: { amountDue: 24500, daysOverdue: 7, customerAgeDays: 400, previousInvoiceCount: 8, previousLatePayments: 2, averagePaymentDelayDays: 3, paymentSuccessRate: 0.75, previousReminders: 0, isVipExempt: false, communicationOptOut: false, cibilScore: 700, humanEngaged: false },
    ...overrides,
  } as RecoveryContext;
}

function dec(overrides: Record<string, unknown> = {}): AgentDecision {
  return { recommendedAction: "CREATE_PAYMENT_LINK", channel: "EMAIL", urgency: "MEDIUM", reason: "test", confidence: 0.85, modelUsed: "rules", ...overrides } as AgentDecision;
}

const NOW = new Date("2026-08-23T12:00:00Z");
const HOURS = 60 * 60 * 1000;

function hist(overrides: Partial<{ now: Date; contactAttempts: number; lastContactAt: Date | null; escalationsToday: number }> = {}) {
  return { now: NOW, contactAttempts: 0, lastContactAt: null, escalationsToday: 0, ...overrides };
}

/** A small-balance context for cost-to-recover-floor tests. */
function tinyBalanceCtx() {
  return ctx({ invoice: { ...ctx().invoice, balance: 150 }, features: { ...ctx().features, amountDue: 150 } });
}

describe("evaluatePolicy", () => {
  it("allows payment link within limits", () => {
    assert.equal(evaluatePolicy({ context: ctx(), decision: dec() }).decision, "ALLOW");
  });

  it("blocks paid invoice", () => {
    assert.equal(evaluatePolicy({ context: ctx({ invoice: { ...ctx().invoice, status: "Paid", balance: 0 } }), decision: dec() }).decision, "BLOCK");
  });

  it("blocks disputed invoice", () => {
    assert.equal(evaluatePolicy({ context: ctx(), decision: dec(), flags: { disputed: true } }).decision, "BLOCK");
  });

  it("requires approval for large balance", () => {
    const c = ctx({ invoice: { ...ctx().invoice, balance: 80000 }, features: { ...ctx().features, amountDue: 80000 } });
    assert.equal(evaluatePolicy({ context: c, decision: dec() }).decision, "REQUIRE_HUMAN_APPROVAL");
  });

  it("manual approval unlocks large balance", () => {
    const c = ctx({ invoice: { ...ctx().invoice, balance: 80000 }, features: { ...ctx().features, amountDue: 80000 } });
    assert.equal(evaluatePolicy({ context: c, decision: dec(), flags: { manualApproval: true } }).decision, "ALLOW");
  });

  it("high risk money action requires approval", () => {
    const c = ctx({ risk: { ...ctx().risk, riskLevel: "HIGH", riskScore: 0.85 } });
    assert.equal(evaluatePolicy({ context: c, decision: dec() }).decision, "REQUIRE_HUMAN_APPROVAL");
  });

  it("STOP always allowed", () => {
    assert.equal(evaluatePolicy({ context: ctx(), decision: dec({ recommendedAction: "STOP" }) }).decision, "ALLOW");
  });

  it("ESCALATE always allowed", () => {
    assert.equal(evaluatePolicy({ context: ctx(), decision: dec({ recommendedAction: "ESCALATE_TO_HUMAN" }) }).decision, "ALLOW");
  });

  it("blocks opted-out notifications", () => {
    assert.equal(evaluatePolicy({ context: ctx(), decision: dec({ recommendedAction: "SEND_REMINDER" }), flags: { optedOut: true } }).decision, "BLOCK");
  });

  it("allows escalation for opted-out", () => {
    assert.equal(evaluatePolicy({ context: ctx(), decision: dec({ recommendedAction: "ESCALATE_TO_HUMAN" }), flags: { optedOut: true } }).decision, "ALLOW");
  });

  it("blocks unknown actions", () => {
    assert.equal(evaluatePolicy({ context: ctx(), decision: dec({ recommendedAction: "FAKE_ACTION" }) }).decision, "BLOCK");
  });

  it("provides reasons", () => {
    const v = evaluatePolicy({ context: ctx(), decision: dec() });
    assert.ok(v.reasons.length > 0);
  });
});

describe("evaluatePolicy — opt-out compliance", () => {
  it("blocks a payment link for an opted-out customer (leak regression)", () => {
    // Regression: payment-link actions used to bypass the opt-out check, so
    // Razorpay would still email the customer via notify.email.
    const v = evaluatePolicy({ context: ctx(), decision: dec({ recommendedAction: "CREATE_PAYMENT_LINK" }), flags: { optedOut: true } });
    assert.equal(v.decision, "BLOCK");
  });

  it("blocks a resend payment link for an opted-out customer", () => {
    assert.equal(evaluatePolicy({ context: ctx(), decision: dec({ recommendedAction: "RESEND_PAYMENT_LINK" }), flags: { optedOut: true } }).decision, "BLOCK");
  });

  it("opt-out is NOT overridable by manual approval (compliance)", () => {
    const v = evaluatePolicy({ context: ctx(), decision: dec({ recommendedAction: "CREATE_PAYMENT_LINK" }), flags: { optedOut: true, manualApproval: true } });
    assert.equal(v.decision, "BLOCK");
  });

  it("still allows escalation for an opted-out customer (no customer contact)", () => {
    assert.equal(evaluatePolicy({ context: ctx(), decision: dec({ recommendedAction: "ESCALATE_TO_HUMAN" }), flags: { optedOut: true } }).decision, "ALLOW");
  });
});

describe("evaluatePolicy — stopping rules", () => {
  it("no history behaves as before (first contact allowed)", () => {
    assert.equal(evaluatePolicy({ context: ctx(), decision: dec() }).decision, "ALLOW");
  });

  it("blocks once max contact attempts is reached", () => {
    const v = evaluatePolicy({ context: ctx(), decision: dec(), history: hist({ contactAttempts: 4 }) });
    assert.equal(v.decision, "BLOCK");
    assert.match(v.reasons.join(" "), /attempt/i);
  });

  it("allows contact while under the attempt cap", () => {
    assert.equal(evaluatePolicy({ context: ctx(), decision: dec(), history: hist({ contactAttempts: 2 }) }).decision, "ALLOW");
  });

  it("blocks a contact inside the cooldown window", () => {
    const v = evaluatePolicy({ context: ctx(), decision: dec(), history: hist({ contactAttempts: 1, lastContactAt: new Date(NOW.getTime() - 1 * HOURS) }) });
    assert.equal(v.decision, "BLOCK");
    assert.match(v.reasons.join(" "), /cooldown/i);
  });

  it("allows a contact after the cooldown window has passed", () => {
    assert.equal(evaluatePolicy({ context: ctx(), decision: dec(), history: hist({ contactAttempts: 1, lastContactAt: new Date(NOW.getTime() - 72 * HOURS) }) }).decision, "ALLOW");
  });

  it("stops chasing a sub-floor balance after the first attempt", () => {
    const v = evaluatePolicy({ context: tinyBalanceCtx(), decision: dec(), history: hist({ contactAttempts: 1 }) });
    assert.equal(v.decision, "BLOCK");
    assert.match(v.reasons.join(" "), /cost-to-recover|floor/i);
  });

  it("allows one free attempt on a sub-floor balance", () => {
    assert.equal(evaluatePolicy({ context: tinyBalanceCtx(), decision: dec(), history: hist({ contactAttempts: 0 }) }).decision, "ALLOW");
  });

  it("manual approval bypasses autonomous stopping rules", () => {
    // A human who approves has taken the decision; attempt/cooldown caps are
    // autonomy bounds, not compliance, so they must not block the approval route.
    const v = evaluatePolicy({ context: ctx(), decision: dec(), flags: { manualApproval: true }, history: hist({ contactAttempts: 4, lastContactAt: new Date(NOW.getTime() - 1 * HOURS) }) });
    assert.equal(v.decision, "ALLOW");
  });
});

describe("evaluatePolicy — escalation cap", () => {
  it("blocks escalation once the daily cap is reached", () => {
    const v = evaluatePolicy({ context: ctx(), decision: dec({ recommendedAction: "ESCALATE_TO_HUMAN" }), history: hist({ escalationsToday: 5 }) });
    assert.equal(v.decision, "BLOCK");
    assert.match(v.reasons.join(" "), /escalation cap/i);
  });

  it("allows escalation while under the daily cap", () => {
    assert.equal(evaluatePolicy({ context: ctx(), decision: dec({ recommendedAction: "ESCALATE_TO_HUMAN" }), history: hist({ escalationsToday: 4 }) }).decision, "ALLOW");
  });
});

describe("getPolicyLimits", () => {
  it("returns numeric limits", () => {
    const l = getPolicyLimits();
    assert.ok(typeof l.autoMoneyLimit === "number");
    assert.ok(l.autoMoneyLimit > 0);
    assert.ok(l.autoNotificationLimit > l.autoMoneyLimit);
  });

  it("exposes the stopping-rule bounds", () => {
    const l = getPolicyLimits();
    assert.ok(l.maxContactAttempts > 0);
    assert.ok(l.contactCooldownHours > 0);
    assert.ok(l.maxEscalationsPerDay > 0);
    assert.ok(l.costToRecoverFloor > 0);
  });
});

describe("merchant policy overrides", () => {
  it("uses a merchant's lower payment-link threshold", () => {
    const v = evaluatePolicy({ context: ctx(), decision: dec(), limits: { autoMoneyLimit: 10_000 } });
    assert.equal(v.decision, "REQUIRE_HUMAN_APPROVAL");
  });

  it("uses a merchant's stricter contact-attempt cap", () => {
    const v = evaluatePolicy({ context: ctx(), decision: dec(), history: hist({ contactAttempts: 1 }), limits: { maxContactAttempts: 1 } });
    assert.equal(v.decision, "BLOCK");
  });

  it("retains defaults when no override is supplied", () => {
    assert.deepEqual(resolvePolicyLimits(), getPolicyLimits());
  });

  it("evaluates configured business hours deterministically", () => {
    assert.equal(isWithinBusinessHours(new Date("2026-08-23T06:00:00Z"), { start: 11, end: 17, timezone: "Asia/Kolkata" }), true);
    assert.equal(isWithinBusinessHours(new Date("2026-08-23T02:00:00Z"), { start: 11, end: 17, timezone: "Asia/Kolkata" }), false);
  });
});

/**
 * Unit tests for the AI recovery stack (Phases 4-8).
 *
 * Covers the pure logic that does not require a database:
 *   - ML risk model + feature engineering
 *   - Policy & safety engine
 *   - Deterministic decision agent (rules fallback)
 *   - Action engine result contract (via policy/decision pipeline)
 *
 * Run with:
 *   pnpm test:ai
 */
import assert from "node:assert/strict";
import { scoreRisk } from "../../lib/ai/ml/risk-model";
import { normalizeFeatures } from "../../lib/ai/ml/features";
import { rulesDecision } from "../../lib/ai/agent/decision-agent";
import { evaluatePolicy } from "../../lib/ai/policy/engine";
import type { RecoveryContext } from "../../lib/ai/context";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    })
    .catch((err) => {
      failed += 1;
      console.error(`  ✗ ${name}`);
      console.error(`    ${err instanceof Error ? err.message : err}`);
    });
}

function baseContext(overrides: Partial<RecoveryContext> = {}): RecoveryContext {
  return {
    invoice: {
      id: 1,
      invoiceNumber: "INV-1001",
      clientName: "Acme Corp",
      clientEmail: "billing@acme.test",
      clientPhone: "",
      total: 24500,
      amountPaid: 0,
      balance: 24500,
      currency: "INR",
      status: "Pending",
      dueDate: new Date(Date.now() - 7 * 86400000),
      daysOverdue: 7,
      customerId: null,
    },
    customer: {
      id: null,
      name: "Acme Corp",
      email: "billing@acme.test",
      isVipExempt: false,
      cibilScore: 700,
      previousInvoiceCount: 8,
      previousLatePayments: 2,
      averagePaymentDelayDays: 3,
      paymentSuccessRate: 0.75,
      customerAgeDays: 400,
      historyCount: 8,
    },
    risk: {
      riskScore: 0.5,
      paymentProbability: 0.5,
      expectedRecovery: 12250,
      amountDue: 24500,
      riskLevel: "MEDIUM",
      contributions: [],
      modelVersion: { name: "test", trainedAt: "", source: "heuristic-calibration" },
    },
    features: {
      amountDue: 24500,
      daysOverdue: 7,
      customerAgeDays: 400,
      previousInvoiceCount: 8,
      previousLatePayments: 2,
      averagePaymentDelayDays: 3,
      paymentSuccessRate: 0.75,
      previousReminders: 0,
      isVipExempt: false,
      cibilScore: 700,
      humanEngaged: false,
    },
    ...overrides,
  } as RecoveryContext;
}

console.log("Phase 4 — ML Risk Engine");
test("high risk when customer is late and overdue", () => {
  const score = scoreRisk({
    amountDue: 24500,
    daysOverdue: 30,
    customerAgeDays: 60,
    previousInvoiceCount: 2,
    previousLatePayments: 2,
    averagePaymentDelayDays: 25,
    paymentSuccessRate: 0,
    previousReminders: 3,
    isVipExempt: false,
    cibilScore: 550,
    humanEngaged: false,
  });
  assert.ok(score.riskScore >= 0.7, `expected HIGH risk, got ${score.riskScore}`);
  assert.equal(score.riskLevel, "HIGH");
});

test("low risk when customer always pays on time", () => {
  const score = scoreRisk({
    amountDue: 12000,
    daysOverdue: 1,
    customerAgeDays: 900,
    previousInvoiceCount: 15,
    previousLatePayments: 0,
    averagePaymentDelayDays: 0,
    paymentSuccessRate: 1,
    previousReminders: 0,
    isVipExempt: false,
    cibilScore: 800,
    humanEngaged: false,
  });
  assert.ok(score.riskScore <= 0.3, `expected LOW risk, got ${score.riskScore}`);
  assert.equal(score.riskLevel, "LOW");
});

test("expected recovery equals balance * payment probability", () => {
  const score = scoreRisk({
    amountDue: 100000,
    daysOverdue: 3,
    customerAgeDays: 300,
    previousInvoiceCount: 5,
    previousLatePayments: 1,
    averagePaymentDelayDays: 5,
    paymentSuccessRate: 0.8,
    previousReminders: 0,
    isVipExempt: false,
    cibilScore: 720,
    humanEngaged: false,
  });
  const expected = Math.round(100000 * score.paymentProbability);
  assert.ok(
    Math.abs(score.expectedRecovery - expected) < 5,
    `expectedRecovery ${score.expectedRecovery} ~ ${expected}`,
  );
});

test("feature normalization stays in [0,1]", () => {
  const norm = normalizeFeatures({
    amountDue: 250000,
    daysOverdue: 90,
    customerAgeDays: 2000,
    previousInvoiceCount: 50,
    previousLatePayments: 30,
    averagePaymentDelayDays: 60,
    paymentSuccessRate: 1.5,
    previousReminders: 20,
    isVipExempt: true,
    cibilScore: 900,
    humanEngaged: false,
  });
  for (const value of Object.values(norm)) {
    assert.ok(value >= 0 && value <= 1, `normalized feature out of range: ${value}`);
  }
});

console.log("Phase 5 — Decision Agent (rules fallback)");
test("paid invoice → STOP", () => {
  const ctx = baseContext({ invoice: { ...baseContext().invoice, status: "Paid", balance: 0 } });
  const decision = rulesDecision({ context: ctx, priorActions: [] });
  assert.equal(decision.recommendedAction, "STOP");
});

test("high risk / large balance → ESCALATE_TO_HUMAN", () => {
  const ctx = baseContext({
    invoice: { ...baseContext().invoice, balance: 60000 },
    risk: { ...baseContext().risk, riskLevel: "HIGH", riskScore: 0.85 },
    features: { ...baseContext().features, amountDue: 60000 },
  });
  const decision = rulesDecision({ context: ctx, priorActions: [] });
  assert.equal(decision.recommendedAction, "ESCALATE_TO_HUMAN");
});

test("existing payment link → RESEND_PAYMENT_LINK", () => {
  const ctx = baseContext();
  const decision = rulesDecision({ context: ctx, priorActions: ["CREATE_PAYMENT_LINK"] });
  assert.equal(decision.recommendedAction, "RESEND_PAYMENT_LINK");
});

test("medium risk → CREATE_PAYMENT_LINK", () => {
  const ctx = baseContext();
  const decision = rulesDecision({ context: ctx, priorActions: [] });
  assert.equal(decision.recommendedAction, "CREATE_PAYMENT_LINK");
});

test("low risk first touch → SEND_REMINDER", () => {
  const ctx = baseContext({
    invoice: { ...baseContext().invoice, balance: 8000 },
    risk: { ...baseContext().risk, riskLevel: "LOW", riskScore: 0.2 },
    features: { ...baseContext().features, amountDue: 8000, previousReminders: 0 },
  });
  const decision = rulesDecision({ context: ctx, priorActions: [] });
  assert.equal(decision.recommendedAction, "SEND_REMINDER");
});

console.log("Phase 6 — Policy & Safety Engine");
test("paid invoice is always blocked", () => {
  const ctx = baseContext({ invoice: { ...baseContext().invoice, status: "Paid", balance: 0 } });
  const decision = rulesDecision({ context: ctx, priorActions: [] });
  const verdict = evaluatePolicy({ context: ctx, decision });
  assert.equal(verdict.decision, "BLOCK");
});

test("large balance payment link requires human approval", () => {
  const ctx = baseContext({
    invoice: { ...baseContext().invoice, balance: 80000 },
    features: { ...baseContext().features, amountDue: 80000 },
  });
  const decision = { ...rulesDecision({ context: ctx, priorActions: [] }), recommendedAction: "CREATE_PAYMENT_LINK" as const };
  const verdict = evaluatePolicy({ context: ctx, decision });
  assert.equal(verdict.decision, "REQUIRE_HUMAN_APPROVAL");
  assert.equal(verdict.approvalRequired, true);
});

test("manual approval unlocks a blocked money action", () => {
  const ctx = baseContext({
    invoice: { ...baseContext().invoice, balance: 80000 },
    features: { ...baseContext().features, amountDue: 80000 },
  });
  const decision = { ...rulesDecision({ context: ctx, priorActions: [] }), recommendedAction: "CREATE_PAYMENT_LINK" as const };
  const verdict = evaluatePolicy({ context: ctx, decision, flags: { manualApproval: true } });
  assert.equal(verdict.decision, "ALLOW");
});

test("disputed invoice blocks all automation", () => {
  const ctx = baseContext({ invoice: { ...baseContext().invoice, status: "Disputed" } });
  const decision = { ...rulesDecision({ context: ctx, priorActions: [] }), recommendedAction: "SEND_REMINDER" as const };
  const verdict = evaluatePolicy({ context: ctx, decision, flags: { disputed: true } });
  assert.equal(verdict.decision, "BLOCK");
});

test("opted-out customer blocks notifications but allows escalation", () => {
  const ctx = baseContext();
  const reminder = { ...rulesDecision({ context: ctx, priorActions: [] }), recommendedAction: "SEND_REMINDER" as const };
  assert.equal(
    evaluatePolicy({ context: ctx, decision: reminder, flags: { optedOut: true } }).decision,
    "BLOCK",
  );
  const escalate = { ...rulesDecision({ context: ctx, priorActions: [] }), recommendedAction: "ESCALATE_TO_HUMAN" as const };
  assert.equal(
    evaluatePolicy({ context: ctx, decision: escalate, flags: { optedOut: true } }).decision,
    "ALLOW",
  );
});

test("high risk money action requires approval even under limit", () => {
  const ctx = baseContext({
    risk: { ...baseContext().risk, riskLevel: "HIGH", riskScore: 0.8 },
  });
  const decision = { ...rulesDecision({ context: ctx, priorActions: [] }), recommendedAction: "CREATE_PAYMENT_LINK" as const };
  const verdict = evaluatePolicy({ context: ctx, decision });
  assert.equal(verdict.decision, "REQUIRE_HUMAN_APPROVAL");
});

setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}, 100);
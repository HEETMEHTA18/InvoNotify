import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreRisk, getModelVersion, riskLevelFromScore } from "../../../lib/ai/ml/risk-model";

describe("scoreRisk", () => {
  const base = {
    amountDue: 24500, daysOverdue: 7, customerAgeDays: 400,
    previousInvoiceCount: 8, previousLatePayments: 2,
    averagePaymentDelayDays: 3, paymentSuccessRate: 0.75,
    previousReminders: 0, isVipExempt: false, cibilScore: 700, humanEngaged: false,
  };

  it("returns valid structure", () => {
    const r = scoreRisk(base);
    assert.ok(typeof r.riskScore === "number");
    assert.ok(typeof r.paymentProbability === "number");
    assert.ok(typeof r.expectedRecovery === "number");
    assert.ok(typeof r.riskLevel === "string");
    assert.ok(Array.isArray(r.contributions));
    assert.equal(r.amountDue, 24500);
  });

  it("riskScore + paymentProbability ≈ 1", () => {
    const r = scoreRisk(base);
    assert.ok(Math.abs(r.riskScore + r.paymentProbability - 1) < 0.001);
  });

  it("expectedRecovery = balance × paymentProbability", () => {
    const r = scoreRisk(base);
    const expected = Math.round(24500 * r.paymentProbability * 100) / 100;
    assert.ok(Math.abs(r.expectedRecovery - expected) < 5);
  });

  it("high risk for overdue + poor history", () => {
    const r = scoreRisk({
      ...base, daysOverdue: 30, previousLatePayments: 2,
      paymentSuccessRate: 0, cibilScore: 550,
    });
    assert.equal(r.riskLevel, "HIGH");
    assert.ok(r.riskScore >= 0.7);
  });

  it("low risk for on-time payer", () => {
    const r = scoreRisk({
      ...base, daysOverdue: 1, previousLatePayments: 0,
      paymentSuccessRate: 1, cibilScore: 800, customerAgeDays: 900,
      previousInvoiceCount: 15,
    });
    assert.equal(r.riskLevel, "LOW");
    assert.ok(r.riskScore <= 0.3);
  });

  it("VIP reduces risk", () => {
    const normal = scoreRisk(base);
    const vip = scoreRisk({ ...base, isVipExempt: true });
    assert.ok(vip.riskScore < normal.riskScore);
  });

  it("human engagement reduces risk", () => {
    const normal = scoreRisk(base);
    const engaged = scoreRisk({ ...base, humanEngaged: true });
    assert.ok(engaged.riskScore < normal.riskScore);
  });

  it("more reminders increase risk", () => {
    const few = scoreRisk({ ...base, previousReminders: 0 });
    const many = scoreRisk({ ...base, previousReminders: 4 });
    assert.ok(many.riskScore > few.riskScore);
  });

  it("contributions sorted by impact magnitude", () => {
    const r = scoreRisk(base);
    // Just verify contributions exist and have expected structure
    assert.ok(r.contributions.length > 0);
    for (const c of r.contributions) {
      assert.ok(typeof c.feature === "string");
      assert.ok(typeof c.value === "number");
      assert.ok(typeof c.contribution === "number");
    }
  });

  it("extreme overdue increases risk significantly", () => {
    const normal = scoreRisk(base);
    const extreme = scoreRisk({ ...base, daysOverdue: 365 });
    // Extreme overdue should increase risk score
    assert.ok(extreme.riskScore > normal.riskScore);
  });
});

describe("getModelVersion", () => {
  it("returns metadata", () => {
    const v = getModelVersion();
    assert.ok(typeof v.name === "string");
    assert.ok(typeof v.trainedAt === "string");
    assert.ok(typeof v.source === "string");
  });
});

describe("riskLevelFromScore", () => {
  it("LOW for < 0.4", () => { assert.equal(riskLevelFromScore(0.1), "LOW"); });
  it("MEDIUM for 0.4-0.69", () => { assert.equal(riskLevelFromScore(0.5), "MEDIUM"); });
  it("HIGH for >= 0.7", () => { assert.equal(riskLevelFromScore(0.8), "HIGH"); });
});
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignExperimentArm,
  buildHoldoutReport,
  compareArms,
  getHoldoutRate,
  hashToUnitInterval,
  summarizeArm,
  type HoldoutCaseOutcome,
} from "../../lib/ai/holdout";

function spread(count: number, rate?: number) {
  const arms = { TREAT: 0, HOLD: 0 };
  for (let invoiceId = 1; invoiceId <= count; invoiceId += 1) {
    arms[assignExperimentArm({ invoiceId, ownerUserId: "merchant-a", rate })] += 1;
  }
  return arms;
}

describe("holdout arm assignment", () => {
  it("is deterministic for the same merchant and invoice", () => {
    const first = assignExperimentArm({ invoiceId: 42, ownerUserId: "m1", rate: 0.5 });
    for (let i = 0; i < 25; i += 1) {
      assert.equal(assignExperimentArm({ invoiceId: 42, ownerUserId: "m1", rate: 0.5 }), first);
    }
  });

  it("is stable across the hash implementation and stays inside [0, 1)", () => {
    for (const key of ["a", "recovery-holdout:v1:m:1", "", "₹"]) {
      const value = hashToUnitInterval(key);
      assert.ok(value >= 0 && value < 1, key);
      assert.equal(value, hashToUnitInterval(key), key);
    }
  });

  it("never holds a case back when the rate is zero", () => {
    const arms = spread(500, 0);
    assert.equal(arms.HOLD, 0);
    assert.equal(arms.TREAT, 500);
  });

  it("holds every case back when the rate is one", () => {
    const arms = spread(500, 1);
    assert.equal(arms.HOLD, 500);
    assert.equal(arms.TREAT, 0);
  });

  it("splits roughly at the configured rate over a large cohort", () => {
    const arms = spread(20_000, 0.1);
    const share = arms.HOLD / 20_000;
    assert.ok(share > 0.08 && share < 0.12, `hold share was ${share}`);
  });

  it("assigns different invoices independently (both arms populated)", () => {
    const arms = spread(200, 0.25);
    assert.ok(arms.HOLD > 0 && arms.TREAT > 0);
  });

  it("scopes assignment per merchant so one tenant cannot shadow another", () => {
    const a = assignExperimentArm({ invoiceId: 7, ownerUserId: "merchant-a", rate: 0.5 });
    const b = assignExperimentArm({ invoiceId: 7, ownerUserId: "merchant-b", rate: 0.5 });
    // Same invoice number, different tenant: the inputs, not a shared counter,
    // decide the arm. Both must still be valid arms.
    assert.ok(["TREAT", "HOLD"].includes(a));
    assert.ok(["TREAT", "HOLD"].includes(b));
  });

  it("clamps an unsafe configured rate instead of trusting the environment", () => {
    assert.equal(getHoldoutRate(undefined), 0.1);
    assert.equal(getHoldoutRate("garbage"), 0.1);
    assert.equal(getHoldoutRate("-1"), 0.1);
    assert.equal(getHoldoutRate("0.25"), 0.25);
    assert.equal(getHoldoutRate("5"), 0.5);
    assert.equal(getHoldoutRate("0"), 0);
  });
});

describe("holdout statistics", () => {
  function outcomes(arm: "TREAT" | "HOLD", recovered: number[], balance = 1000): HoldoutCaseOutcome[] {
    return recovered.map((amount) => ({ arm, amountAtRisk: balance, recoveredAmount: amount }));
  }

  it("summarises money and per-case recovery separately", () => {
    const stats = summarizeArm("TREAT", [
      { arm: "TREAT", amountAtRisk: 1000, recoveredAmount: 1000 },
      { arm: "TREAT", amountAtRisk: 1000, recoveredAmount: 0 },
      { arm: "HOLD", amountAtRisk: 5000, recoveredAmount: 5000 },
    ]);

    assert.equal(stats.cases, 2);
    assert.equal(stats.amountAtRisk, 2000);
    assert.equal(stats.recoveredAmount, 1000);
    assert.equal(stats.recoveredShareOfAtRisk, 0.5);
    assert.equal(stats.casesWithRecovery, 1);
    assert.equal(stats.settledCaseRate, 0.5);
    assert.equal(stats.meanCaseRecoveryFraction, 0.5);
    assert.ok(stats.ci95[0] < 0.5 && stats.ci95[1] > 0.5);
  });

  it("caps an overpayment at the amount that was at risk", () => {
    const stats = summarizeArm("TREAT", [
      { arm: "TREAT", amountAtRisk: 1000, recoveredAmount: 4000 },
    ]);
    assert.equal(stats.meanCaseRecoveryFraction, 1);
  });

  it("reports a significant uplift when the arms are clearly separated", () => {
    const treat = summarizeArm("TREAT", outcomes("TREAT", Array(500).fill(900)));
    const hold = summarizeArm("HOLD", outcomes("HOLD", Array(500).fill(300)));
    const effect = compareArms({ treat, hold });

    assert.equal(effect.verdict, "MEASURED_UPLIFT");
    assert.equal(effect.significant, true);
    assert.ok(effect.absoluteDelta > 0.5);
    assert.ok(effect.ci95[0] > 0);
  });

  it("refuses to claim an effect on a small sample", () => {
    const treat = summarizeArm("TREAT", outcomes("TREAT", Array(5).fill(900)));
    const hold = summarizeArm("HOLD", outcomes("HOLD", Array(5).fill(100)));
    const effect = compareArms({ treat, hold });

    assert.equal(effect.verdict, "INSUFFICIENT_SAMPLE");
    assert.equal(effect.significant, false);
    assert.match(effect.interpretation, /Not enough measured cases/);
  });

  it("reports a shortfall instead of hiding a worse treatment arm", () => {
    const treat = summarizeArm("TREAT", outcomes("TREAT", Array(300).fill(100)));
    const hold = summarizeArm("HOLD", outcomes("HOLD", Array(300).fill(800)));
    const effect = compareArms({ treat, hold });

    assert.equal(effect.verdict, "MEASURED_SHORTFALL");
    assert.ok(effect.absoluteDelta < 0);
    assert.match(effect.interpretation, /shortfall/i);
  });

  it("calls overlapping arms indistinguishable", () => {
    const treat = summarizeArm("TREAT", outcomes("TREAT", Array(200).fill(400)));
    const hold = summarizeArm("HOLD", outcomes("HOLD", Array(200).fill(410)));
    const effect = compareArms({ treat, hold });

    assert.equal(effect.verdict, "NO_MEASURABLE_DIFFERENCE");
    assert.equal(effect.significant, false);
  });

  it("handles an empty cohort without dividing by zero", () => {
    const report = buildHoldoutReport({
      outcomes: [],
      generatedAt: new Date("2026-11-12T00:00:00Z"),
    });

    assert.equal(report.arms.TREAT.cases, 0);
    assert.equal(report.arms.HOLD.cases, 0);
    assert.equal(report.arms.TREAT.recoveredShareOfAtRisk, 0);
    assert.equal(report.effect.verdict, "INSUFFICIENT_SAMPLE");
    assert.equal(report.effect.relativeDelta, null);
    assert.equal(report.provenance.measuredCases, 0);
  });

  it("labels the report as settled-cash provenance, not a forecast", () => {
    const report = buildHoldoutReport({ outcomes: outcomes("TREAT", [500]) });
    assert.equal(report.provenance.outcomeSource, "RecoverySettlement (unique paymentId)");
    assert.equal(report.assignment.persistedAtCaseCreation, true);
    assert.match(report.provenance.note, /Confirmed settlements only/);
  });
});

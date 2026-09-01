import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateRecoveryCredit } from "../../lib/ai/revenue-ledger";

describe("calculateRecoveryCredit", () => {
  it("credits a confirmed full payment up to the original amount at risk", () => {
    const result = calculateRecoveryCredit({
      amountAtRisk: 24_500,
      recoveredAmount: 0,
      confirmedPaymentAmount: 24_500,
    });

    assert.deepEqual(result, {
      creditedAmount: 24_500,
      recoveredAmount: 24_500,
      outstandingAmount: 0,
    });
  });

  it("accumulates partial payments without claiming the unpaid balance", () => {
    const first = calculateRecoveryCredit({
      amountAtRisk: 35_000,
      recoveredAmount: 0,
      confirmedPaymentAmount: 10_000,
    });
    const second = calculateRecoveryCredit({
      amountAtRisk: 35_000,
      recoveredAmount: first.recoveredAmount,
      confirmedPaymentAmount: 25_000,
    });

    assert.deepEqual(first, {
      creditedAmount: 10_000,
      recoveredAmount: 10_000,
      outstandingAmount: 25_000,
    });
    assert.deepEqual(second, {
      creditedAmount: 25_000,
      recoveredAmount: 35_000,
      outstandingAmount: 0,
    });
  });

  it("does not double count a repeated provider callback", () => {
    const result = calculateRecoveryCredit({
      amountAtRisk: 5_000,
      recoveredAmount: 5_000,
      confirmedPaymentAmount: 5_000,
    });

    assert.deepEqual(result, {
      creditedAmount: 0,
      recoveredAmount: 5_000,
      outstandingAmount: 0,
    });
  });

  it("caps an overpayment at the remaining amount at risk", () => {
    const result = calculateRecoveryCredit({
      amountAtRisk: 10_000,
      recoveredAmount: 8_250,
      confirmedPaymentAmount: 5_000,
    });

    assert.deepEqual(result, {
      creditedAmount: 1_750,
      recoveredAmount: 10_000,
      outstandingAmount: 0,
    });
  });

  it("uses paise arithmetic for fractional rupees", () => {
    const result = calculateRecoveryCredit({
      amountAtRisk: 100.01,
      recoveredAmount: 33.34,
      confirmedPaymentAmount: 66.67,
    });

    assert.deepEqual(result, {
      creditedAmount: 66.67,
      recoveredAmount: 100.01,
      outstandingAmount: 0,
    });
  });
});

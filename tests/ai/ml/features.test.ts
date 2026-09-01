import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeFeatures, extractCustomerFeatures } from "../../../lib/ai/ml/features";

describe("normalizeFeatures", () => {
  it("normalizes all features to [0,1]", () => {
    const result = normalizeFeatures({
      amountDue: 250000, daysOverdue: 90, customerAgeDays: 2000,
      previousInvoiceCount: 50, previousLatePayments: 30,
      averagePaymentDelayDays: 60, paymentSuccessRate: 1.5,
      previousReminders: 20, isVipExempt: true, cibilScore: 900, humanEngaged: false,
    });
    for (const value of Object.values(result)) {
      assert.ok(value >= 0 && value <= 1, `Feature out of range: ${value}`);
    }
  });

  it("handles zero values", () => {
    const result = normalizeFeatures({
      amountDue: 0, daysOverdue: 0, customerAgeDays: 0,
      previousInvoiceCount: 0, previousLatePayments: 0,
      averagePaymentDelayDays: 0, paymentSuccessRate: 0,
      previousReminders: 0, isVipExempt: false, cibilScore: 300, humanEngaged: false,
    });
    assert.equal(result.amountDue, 0);
    assert.equal(result.daysOverdue, 0);
    assert.equal(result.isVipExempt, 0);
    assert.equal(result.humanEngaged, 0);
  });

  it("clamps negative inputs to 0", () => {
    const result = normalizeFeatures({
      amountDue: -100, daysOverdue: -5, customerAgeDays: -1,
      previousInvoiceCount: -10, previousLatePayments: -3,
      averagePaymentDelayDays: -2, paymentSuccessRate: -0.5,
      previousReminders: -1, isVipExempt: false, cibilScore: 100, humanEngaged: false,
    });
    assert.equal(result.amountDue, 0);
    assert.equal(result.daysOverdue, 0);
    assert.equal(result.paymentSuccessRate, 0);
  });

  it("clamps CIBIL to [300,900]", () => {
    const low = normalizeFeatures({
      amountDue: 1000, daysOverdue: 1, customerAgeDays: 100,
      previousInvoiceCount: 1, previousLatePayments: 0,
      averagePaymentDelayDays: 0, paymentSuccessRate: 1,
      previousReminders: 0, isVipExempt: false, cibilScore: 200, humanEngaged: false,
    });
    const high = normalizeFeatures({
      amountDue: 1000, daysOverdue: 1, customerAgeDays: 100,
      previousInvoiceCount: 1, previousLatePayments: 0,
      averagePaymentDelayDays: 0, paymentSuccessRate: 1,
      previousReminders: 0, isVipExempt: false, cibilScore: 1000, humanEngaged: false,
    });
    assert.equal(low.cibilScore, 0);
    assert.equal(high.cibilScore, 1);
  });
});

describe("extractCustomerFeatures", () => {
  it("clamps late payments to invoice count", () => {
    const result = extractCustomerFeatures({
      previousInvoiceCount: 3, previousLatePayments: 10,
      averagePaymentDelayDays: 5, paymentSuccessRate: 0.7, customerAgeDays: 200,
    });
    assert.equal(result.previousLatePayments, 3);
  });

  it("returns 0 success rate for new customers", () => {
    const result = extractCustomerFeatures({
      previousInvoiceCount: 0, previousLatePayments: 0,
      averagePaymentDelayDays: 0, paymentSuccessRate: 1, customerAgeDays: 30,
    });
    assert.equal(result.paymentSuccessRate, 0);
  });

  it("clamps negative values to 0", () => {
    const result = extractCustomerFeatures({
      previousInvoiceCount: -5, previousLatePayments: -2,
      averagePaymentDelayDays: -10, paymentSuccessRate: 0.8, customerAgeDays: -100,
    });
    assert.equal(result.previousInvoiceCount, 0);
    assert.equal(result.previousLatePayments, 0);
    assert.equal(result.averagePaymentDelayDays, 0);
    assert.equal(result.customerAgeDays, 0);
  });
});
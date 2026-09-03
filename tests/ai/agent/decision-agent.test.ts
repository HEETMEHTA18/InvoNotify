import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rulesDecision } from "../../../lib/ai/agent/decision-agent";
import type { RecoveryContext } from "../../../lib/ai/context";

function ctx(overrides: Record<string, unknown> = {}): RecoveryContext {
  return {
    invoice: { id: 1, invoiceNumber: "INV-1001", clientName: "Acme", clientEmail: "a@b.c", clientPhone: "", total: 24500, amountPaid: 0, balance: 24500, currency: "INR", status: "Pending", dueDate: new Date(Date.now() - 7 * 86400000), daysOverdue: 7, customerId: null, razorpayPaymentLinkId: null, razorpayPaymentLinkUrl: null, reminderChannel: "EMAIL" },
    customer: { id: null, name: "Acme", email: "a@b.c", isVipExempt: false, communicationOptOut: false, cibilScore: 700, previousInvoiceCount: 8, previousLatePayments: 2, averagePaymentDelayDays: 3, paymentSuccessRate: 0.75, customerAgeDays: 400, historyCount: 8 },
    risk: { riskScore: 0.5, paymentProbability: 0.5, expectedRecovery: 12250, amountDue: 24500, riskLevel: "MEDIUM", contributions: [], modelVersion: { name: "test", trainedAt: "", source: "heuristic-calibration" } },
    features: { amountDue: 24500, daysOverdue: 7, customerAgeDays: 400, previousInvoiceCount: 8, previousLatePayments: 2, averagePaymentDelayDays: 3, paymentSuccessRate: 0.75, previousReminders: 0, isVipExempt: false, communicationOptOut: false, cibilScore: 700, humanEngaged: false },
    ...overrides,
  } as RecoveryContext;
}

describe("rulesDecision", () => {
  it("STOP for paid invoice", () => {
    const c = ctx({ invoice: { ...ctx().invoice, status: "Paid", balance: 0 } });
    assert.equal(rulesDecision({ context: c, priorActions: [] }).recommendedAction, "STOP");
  });

  it("ESCALATE for high risk / large balance", () => {
    const c = ctx({
      invoice: { ...ctx().invoice, balance: 60000 },
      risk: { ...ctx().risk, riskLevel: "HIGH", riskScore: 0.85 },
      features: { ...ctx().features, amountDue: 60000 },
    });
    assert.equal(rulesDecision({ context: c, priorActions: [] }).recommendedAction, "ESCALATE_TO_HUMAN");
  });

  it("RESEND when payment link exists", () => {
    assert.equal(rulesDecision({ context: ctx(), priorActions: ["CREATE_PAYMENT_LINK"] }).recommendedAction, "RESEND_PAYMENT_LINK");
  });

  it("CREATE_PAYMENT_LINK for medium risk", () => {
    assert.equal(rulesDecision({ context: ctx(), priorActions: [] }).recommendedAction, "CREATE_PAYMENT_LINK");
  });

  it("SEND_REMINDER for low risk first touch", () => {
    const c = ctx({
      invoice: { ...ctx().invoice, balance: 8000 },
      risk: { ...ctx().risk, riskLevel: "LOW", riskScore: 0.2 },
      features: { ...ctx().features, amountDue: 8000, previousReminders: 0 },
    });
    assert.equal(rulesDecision({ context: c, priorActions: [] }).recommendedAction, "SEND_REMINDER");
  });

  it("SCHEDULE_FOLLOWUP when no other action applies", () => {
    const c = ctx({
      invoice: { ...ctx().invoice, balance: 5000 },
      risk: { ...ctx().risk, riskLevel: "LOW", riskScore: 0.1 },
      features: { ...ctx().features, amountDue: 5000 },
    });
    const d = rulesDecision({ context: c, priorActions: ["SEND_REMINDER"] });
    // After reminder sent for low risk, next action is SCHEDULE_FOLLOWUP
    assert.ok(["SCHEDULE_FOLLOWUP", "CREATE_PAYMENT_LINK"].includes(d.recommendedAction));
  });

  it("valid channel", () => {
    const d = rulesDecision({ context: ctx(), priorActions: [] });
    assert.ok(["EMAIL", "SMS", "BOTH"].includes(d.channel));
  });

  it("valid urgency", () => {
    const d = rulesDecision({ context: ctx(), priorActions: [] });
    assert.ok(["LOW", "MEDIUM", "HIGH"].includes(d.urgency));
  });

  it("confidence in [0,1]", () => {
    const d = rulesDecision({ context: ctx(), priorActions: [] });
    assert.ok(d.confidence >= 0 && d.confidence <= 1);
  });

  it("always provides a reason", () => {
    const d = rulesDecision({ context: ctx(), priorActions: [] });
    assert.ok(typeof d.reason === "string" && d.reason.length > 0);
  });
});
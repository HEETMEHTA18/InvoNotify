import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeRevenueEvent,
  parseRevenueEventCsv,
  RevenueEventValidationError,
  type RevenueEventInput,
} from "../../lib/revenue-events";

function event(overrides: Partial<RevenueEventInput> = {}): RevenueEventInput {
  return {
    source: "demo-batch",
    sourceEventId: "evt-001",
    eventType: "payment.failed",
    customerId: "customer-001",
    amount: 12_500,
    currency: "INR",
    payload: {},
    ...overrides,
  };
}

describe("Module A revenue-event normalization", () => {
  it("normalizes supported provider event aliases and canonical failure codes", () => {
    const result = normalizeRevenueEvent(
      event({ eventType: "payment.failed", failureCode: "network-timeout" }),
    );

    assert.equal(result.eventType, "PAYMENT_FAILED");
    assert.equal(result.failureCode, "NETWORK_TIMEOUT");
    assert.equal(result.quarantine, undefined);
  });

  it("derives a canonical failure code for checkout abandonment", () => {
    const result = normalizeRevenueEvent(
      event({ eventType: "checkout.abandoned", failureCode: undefined }),
    );

    assert.equal(result.eventType, "CHECKOUT_ABANDONED");
    assert.equal(result.failureCode, "CUSTOMER_ABANDONED");
  });

  it("quarantines unknown event types without inventing a recovery cause", () => {
    const result = normalizeRevenueEvent(event({ eventType: "payment.succeeded" }));

    assert.equal(result.eventType, "UNKNOWN");
    assert.equal(result.quarantine?.code, "UNKNOWN_EVENT_TYPE");
  });

  it("quarantines an unmapped provider failure code", () => {
    const result = normalizeRevenueEvent(event({ failureCode: "issuer_mood" }));

    assert.equal(result.eventType, "PAYMENT_FAILED");
    assert.equal(result.quarantine?.code, "UNKNOWN_FAILURE_CODE");
  });

  it("requires a customer reference before a supported at-risk event can enter the pipeline", () => {
    assert.throws(
      () => normalizeRevenueEvent(event({ customerId: undefined, payload: {} })),
      (error: unknown) =>
        error instanceof RevenueEventValidationError && error.code === "MISSING_CUSTOMER_REFERENCE",
    );
  });

  it("accepts a payload customer reference when a provider does not put it at the top level", () => {
    const result = normalizeRevenueEvent(
      event({ customerId: undefined, payload: { customer_id: "cust-from-payload" } }),
    );

    assert.equal(result.customerId, "cust-from-payload");
  });

  it("parses a quoted CSV payload through the same validated input contract", () => {
    const [parsed] = parseRevenueEventCsv(
      [
        "source,sourceEventId,eventType,customerId,amount,currency,occurredAt,failureCode,failureReason,payload",
        'sandbox,evt-csv-1,checkout.abandoned,cust-csv,15000,INR,2026-08-31T12:00:00Z,,,"{""checkoutId"":""chk-1""}"',
      ].join("\n"),
    );

    assert.equal(parsed.sourceEventId, "evt-csv-1");
    assert.equal(parsed.amount, 15000);
    assert.deepEqual(parsed.payload, { checkoutId: "chk-1" });
  });

  it("rejects a CSV that lacks the required customer reference column", () => {
    assert.throws(
      () => parseRevenueEventCsv("source,sourceEventId,eventType,amount\nsandbox,evt-1,payment.failed,100"),
      (error: unknown) =>
        error instanceof RevenueEventValidationError && error.code === "INVALID_CSV_HEADER",
    );
  });
});

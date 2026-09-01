import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";
import { verifyRazorpayWebhookSignature } from "../../lib/razorpay";

describe("Razorpay webhook signature verification", () => {
  const secret = "test-webhook-secret";
  const body = JSON.stringify({
    entity: "event",
    event: "payment_link.paid",
    payload: { payment_link: { entity: { id: "plink_test" } } },
  });
  const validSignature = crypto.createHmac("sha256", secret).update(body).digest("hex");

  it("accepts a signature over the exact unmodified request body", () => {
    assert.equal(verifyRazorpayWebhookSignature(body, validSignature, secret), true);
  });

  it("rejects a missing, forged, or differently serialized body", () => {
    assert.equal(verifyRazorpayWebhookSignature(body, null, secret), false);
    assert.equal(verifyRazorpayWebhookSignature(body, "0".repeat(64), secret), false);
    assert.equal(
      verifyRazorpayWebhookSignature(`${body}\n`, validSignature, secret),
      false,
    );
  });

  it("rejects a malformed signature without throwing", () => {
    assert.equal(verifyRazorpayWebhookSignature(body, "not-a-hex-signature", secret), false);
  });
});

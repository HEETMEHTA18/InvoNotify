import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createPublicInvoiceToken,
  parsePublicInvoiceToken,
} from "../../lib/security/public-invoice";

describe("public invoice capability tokens", () => {
  it("creates a non-enumerable 256-bit token", () => {
    const token = createPublicInvoiceToken();
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.equal(parsePublicInvoiceToken(token), token);
  });

  it("rejects numeric invoice IDs and malformed public capabilities", () => {
    for (const value of [undefined, "", "337", "../337", "a".repeat(63), "G".repeat(64)]) {
      assert.equal(parsePublicInvoiceToken(value), null);
    }
  });
});

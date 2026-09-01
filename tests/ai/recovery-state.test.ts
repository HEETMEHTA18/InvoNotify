import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTerminalRecoveryCaseStatus } from "../../lib/ai/orchestrator";

describe("terminal recovery-case guard", () => {
  it("blocks every terminal state from automatic execution", () => {
    for (const status of ["PAID", "RECOVERED", "STOPPED", "CLOSED", "CLOSED_UNRECOVERED"]) {
      assert.equal(isTerminalRecoveryCaseStatus(status), true, status);
    }
  });

  it("keeps active workflow states eligible for a policy evaluation", () => {
    for (const status of ["OPEN", "CONTACTED", "AWAITING_APPROVAL", "ESCALATED", "BLOCKED"]) {
      assert.equal(isTerminalRecoveryCaseStatus(status), false, status);
    }
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyContactWindowGuard,
  isWithinCustomerContactWindow,
  type CustomerContactWindow,
} from "../../lib/ai/policy/merchant-policy";

const indiaWeekdays: CustomerContactWindow = {
  timezone: "Asia/Kolkata",
  start: 9,
  end: 18,
  businessDays: [1, 2, 3, 4, 5],
};

describe("customer local contact windows", () => {
  it("allows a weekday contact in the customer's local hours", () => {
    // Monday 11:00 in Asia/Kolkata.
    assert.equal(
      isWithinCustomerContactWindow(new Date("2026-01-05T05:30:00.000Z"), indiaWeekdays),
      true,
    );
  });

  it("blocks weekends, out-of-hours, and malformed customer windows", () => {
    assert.equal(
      isWithinCustomerContactWindow(new Date("2026-01-04T05:30:00.000Z"), indiaWeekdays),
      false,
    );
    assert.equal(
      isWithinCustomerContactWindow(new Date("2026-01-05T14:30:00.000Z"), indiaWeekdays),
      false,
    );
    assert.equal(
      isWithinCustomerContactWindow(new Date("2026-01-05T05:30:00.000Z"), {
        ...indiaWeekdays,
        timezone: "Not/A-Timezone",
      }),
      false,
    );
  });

  it("turns an otherwise allowed outbound action into an auditable block", () => {
    const verdict = applyContactWindowGuard({
      verdict: { decision: "ALLOW", approvalRequired: false, reasons: ["Base policy passed"] },
      action: "SEND_REMINDER",
      now: new Date("2026-01-04T05:30:00.000Z"),
      customerContactWindow: indiaWeekdays,
    });
    assert.deepEqual(verdict, {
      decision: "BLOCK",
      approvalRequired: false,
      reasons: ["Contact action is outside the customer's configured local contact window"],
    });
  });

  it("does not block non-contact actions or customers without a configured profile", () => {
    const base = { decision: "ALLOW" as const, approvalRequired: false, reasons: ["Base policy passed"] };
    assert.deepEqual(
      applyContactWindowGuard({ action: "ESCALATE_TO_HUMAN", now: new Date(), verdict: base, customerContactWindow: indiaWeekdays }),
      base,
    );
    assert.deepEqual(
      applyContactWindowGuard({ action: "SEND_REMINDER", now: new Date(), verdict: base }),
      base,
    );
  });
});

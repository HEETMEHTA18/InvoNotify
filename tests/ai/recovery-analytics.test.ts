import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildRecoveryAnalytics,
  parseAnalyticsDays,
  type AnalyticsCase,
} from "@/lib/recovery-analytics";

const startDate = new Date("2026-08-01T00:00:00.000Z");

function action(overrides: Partial<AnalyticsCase["actions"][number]> = {}): AnalyticsCase["actions"][number] {
  return {
    id: 1,
    actionType: "SEND_REMINDER",
    status: "EXECUTED",
    executionStatus: "EXECUTED",
    provider: "email",
    payload: null,
    ...overrides,
  };
}

function settlement(overrides: Partial<AnalyticsCase["settlements"][number]> = {}): AnalyticsCase["settlements"][number] {
  return {
    id: 1,
    paymentId: 101,
    amount: 60,
    attribution: "POTENTIALLY_ACTION_ATTRIBUTED",
    attributedAgentRunId: 77,
    attributedAgentActionId: 1,
    ...overrides,
  };
}

function recoveryCase(overrides: Partial<AnalyticsCase> = {}): AnalyticsCase {
  return {
    id: 10,
    status: "CONTACTED",
    stage: "EXECUTION",
    amountAtRisk: 100,
    actions: [action()],
    settlements: [settlement()],
    diagnosis: { category: "PAYMENT_METHOD_FRICTION" },
    ...overrides,
  };
}

describe("Module I settlement-ledger analytics", () => {
  it("uses unique RecoverySettlement payment IDs rather than a case-level recovered cache", () => {
    const snapshot = buildRecoveryAnalytics({
      days: 30,
      startDate,
      cases: [
        recoveryCase({
          // The raw shape intentionally has no RecoveryCase.recoveredAmount.
          // A duplicated replay/export payment must not double-count the KPI.
          settlements: [
            settlement({ id: 1, paymentId: 501, amount: 60 }),
            settlement({ id: 2, paymentId: 501, amount: 60 }),
          ],
        }),
      ],
    });

    assert.equal(snapshot.summary.amountAtRisk, 100);
    assert.equal(snapshot.summary.uniqueSettledRecovered, 60);
    assert.equal(snapshot.summary.confirmedUniqueRecovered, 60);
    assert.equal(snapshot.summary.totalRecovered, 60);
    assert.equal(snapshot.summary.recoveryRate, 60);
    assert.equal(snapshot.summary.recoveryRateDenominator, "amountAtRisk");
    assert.equal(snapshot.funnel.recovered, 1);
    assert.equal(snapshot.interventions[0]?.recoveredAmount, 60);
  });

  it("keeps deterministic demo settlements and simulated actions explicit", () => {
    const simulated = action({
      id: 2,
      actionType: "CREATE_PAYMENT_LINK",
      status: "SIMULATED",
      executionStatus: "SIMULATED",
      provider: "simulation",
      payload: { dryRun: true },
    });
    const snapshot = buildRecoveryAnalytics({
      days: 30,
      startDate,
      cases: [
        recoveryCase(),
        recoveryCase({
          id: 11,
          status: "OPEN",
          stage: "SIMULATED",
          amountAtRisk: 40,
          actions: [simulated],
          settlements: [
            settlement({
              id: 2,
              paymentId: 502,
              amount: 40,
              attribution: "SEEDED_DEMO",
              attributedAgentRunId: null,
              attributedAgentActionId: null,
            }),
          ],
          diagnosis: { category: "CASH_FLOW_CONSTRAINT" },
        }),
      ],
    });

    assert.equal(snapshot.summary.uniqueSettledRecovered, 100);
    assert.equal(snapshot.summary.confirmedUniqueRecovered, 60);
    assert.equal(snapshot.summary.nonDemoSettledRecovered, 60);
    assert.equal(snapshot.summary.safeDemoRecovered, 40);
    assert.equal(snapshot.provenance.actionHistory.simulatedAttempts, 1);
    assert.match(snapshot.provenance.uniqueSettledRevenue.note, /not live provider money/i);

    const simulationIntervention = snapshot.interventions.find(
      (row) => row.actionType === "CREATE_PAYMENT_LINK",
    );
    assert.deepEqual(simulationIntervention && {
      attempts: simulationIntervention.attempts,
      actualAttempts: simulationIntervention.actualAttempts,
      simulatedAttempts: simulationIntervention.simulatedAttempts,
      recoveredAmount: simulationIntervention.recoveredAmount,
    }, {
      attempts: 1,
      actualAttempts: 0,
      simulatedAttempts: 1,
      recoveredAmount: 0,
    });
  });

  it("returns aggregate root causes and scoped case-id-only drilldowns", () => {
    // The aggregator's input deliberately narrows to IDs and aggregate fields.
    // Extra ORM/UI data must be ignored if a future caller accidentally passes it.
    const privateCase = Object.assign(recoveryCase(), {
      clientName: "Customer Name That Must Not Escape",
      clientEmail: "customer@example.test",
      invoiceNumber: "INV-PII-001",
    });
    const snapshot = buildRecoveryAnalytics({
      days: 30,
      startDate,
      cases: [
        privateCase,
        recoveryCase({
          id: 11,
          amountAtRisk: 40,
          actions: [],
          settlements: [],
          diagnosis: { category: "PAYMENT_METHOD_FRICTION" },
        }),
      ],
    });

    assert.deepEqual(snapshot.rootCauses, [
      {
        category: "PAYMENT_METHOD_FRICTION",
        caseCount: 2,
        amountAtRisk: 140,
        recoveredAmount: 60,
        recoveryRate: 42.86,
        drilldown: { caseIds: [10, 11], totalCases: 2, truncated: false },
      },
    ]);
    assert.deepEqual(snapshot.funnelDrilldowns.recovered, {
      caseIds: [10],
      totalCases: 1,
      truncated: false,
    });
    assert.equal(JSON.stringify(snapshot).includes("customer@example.test"), false);
  });
});

describe("parseAnalyticsDays", () => {
  it("clamps invalid and oversized periods", () => {
    assert.equal(parseAnalyticsDays("0"), 1);
    assert.equal(parseAnalyticsDays("1000"), 365);
    assert.equal(parseAnalyticsDays("not-a-number"), 30);
  });
});

/**
 * Local end-to-end verification of the AI recovery loop.
 *
 * Proves, against a real database, the things the judge rubric asks for:
 *   1. a sweep runs and produces measured decisions
 *   2. every decision lands in the AgentAction audit trail with a policy verdict
 *   3. the opt-out compliance rule BLOCKS a customer-contact action
 *   4. the policy limits actually in force are the ones documented
 *
 * Run with:
 *   pnpm ai:verify
 *
 * The extra loader is not optional: this script pulls in the real orchestrator,
 * which transitively imports the `server-only` marker package. That package is
 * supplied by the Next bundler and does not exist in node_modules, so plain
 * Node cannot resolve it. See scripts/ai/loaders/register.mjs.
 */
import { prisma } from "@/lib/db";
import { runRecoverySweep } from "@/lib/ai/orchestrator";
import { POLICY_LIMITS, CONTACT_ACTIONS } from "@/lib/ai/policy/engine";
import { CHASEABLE_INVOICE_STATUSES } from "@/lib/customer-credit";
import { LOCAL_HACKATHON_DEMO } from "../../lib/demo-account";

// Keep verification aligned with the documented, safe local showcase account.
const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL || LOCAL_HACKATHON_DEMO.email;
const SEEDED_RECOVERED_INVOICES = ["ACM-1010", "GAM-1011", "EPS-1012"];

type AuditRow = {
  id: number;
  invoiceId: number | null;
  invoiceNumber: string;
  clientName: string;
  balance: number;
  actionType: string;
  riskScore: number;
  policyResult: string;
  status: string;
  executionStatus: string | null;
  fallbackUsed: boolean;
  reasons: string[];
};

function hr(title: string) {
  console.log(`\n${"=".repeat(78)}\n${title}\n${"=".repeat(78)}`);
}

function asReasons(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === "string") return [value];
  return [];
}

async function readAudit(runId: number): Promise<AuditRow[]> {
  const actions = await prisma.agentAction.findMany({
    where: { agentRunId: runId },
    orderBy: { id: "asc" },
  });

  const invoiceIds = actions.map((a) => a.invoiceId).filter((v): v is number => v !== null);
  const invoices = await prisma.invoice.findMany({
    where: { id: { in: invoiceIds } },
    select: { id: true, invoiceNumber: true, clientName: true, balance: true },
  });
  const byId = new Map(invoices.map((i) => [i.id, i]));

  return actions.map((a) => {
    const inv = a.invoiceId ? byId.get(a.invoiceId) : undefined;
    return {
      id: a.id,
      invoiceId: a.invoiceId,
      invoiceNumber: inv?.invoiceNumber ?? "-",
      clientName: inv?.clientName ?? "-",
      balance: Number(inv?.balance ?? 0),
      actionType: a.actionType,
      riskScore: Number(a.riskScore),
      policyResult: a.policyResult,
      status: a.status,
      executionStatus: a.executionStatus,
      fallbackUsed: a.fallbackUsed,
      reasons: asReasons(a.policyReasons),
    };
  });
}

function printAudit(rows: AuditRow[]) {
  const w = { inv: 10, cust: 16, bal: 9, risk: 6, action: 20, policy: 22, status: 10 };
  console.log(
    "invoice".padEnd(w.inv) +
      "customer".padEnd(w.cust) +
      "balance".padStart(w.bal) +
      "  risk".padEnd(w.risk + 2) +
      "action".padEnd(w.action) +
      "policy".padEnd(w.policy) +
      "status".padEnd(w.status) +
      "policy reason"
  );
  console.log("-".repeat(130));
  for (const r of rows) {
    console.log(
      r.invoiceNumber.padEnd(w.inv) +
        r.clientName.slice(0, w.cust - 1).padEnd(w.cust) +
        r.balance.toFixed(0).padStart(w.bal) +
        "  " +
        r.riskScore.toFixed(3).padEnd(w.risk) +
        r.actionType.padEnd(w.action) +
        r.policyResult.padEnd(w.policy) +
        r.status.padEnd(w.status) +
        r.reasons.join("; ")
    );
  }
}

/**
 * Explains an empty sweep instead of failing with a bare assertion.
 *
 * The sweep selects on three conditions at once (owner, status, due date and
 * balance), so "0 invoices found" has several possible causes that look
 * identical from the outside. This reports each condition separately so the
 * real reason is visible — most often a prior run left invoice statuses outside
 * the {Pending, Draft} set the sweep looks at.
 */
async function diagnoseEmptySweep(userId: string) {
  const now = new Date();
  const owned = { OR: [{ ownerUserId: userId }, { userId }] };

  const [byStatus, ownedCount, overdueAny, positiveBalance, sweepable] = await Promise.all([
    prisma.invoice.groupBy({
      by: ["status"],
      where: owned,
      _count: { _all: true },
      _sum: { balance: true },
    }),
    prisma.invoice.count({ where: owned }),
    prisma.invoice.count({ where: { ...owned, dueDate: { lt: now } } }),
    prisma.invoice.count({ where: { ...owned, dueDate: { lt: now }, balance: { gt: 0 } } }),
    prisma.invoice.count({
      where: {
        ...owned,
        dueDate: { lt: now },
        balance: { gt: 0 },
        status: { in: [...CHASEABLE_INVOICE_STATUSES] },
      },
    }),
  ]);

  console.log(`Nothing was swept. Narrowing down why:\n`);
  console.log(`  invoices owned by this user            ${ownedCount}`);
  console.log(`  ...of those, past due                 ${overdueAny}`);
  console.log(`  ...of those, balance > 0              ${positiveBalance}`);
  console.log(
    `  ...of those, status is chaseable      ${sweepable}   <- what the sweep takes` +
      `\n      (${CHASEABLE_INVOICE_STATUSES.join(", ")})`
  );
  console.log(`\n  status breakdown (all owned invoices):`);
  for (const row of byStatus.sort((a, b) => b._count._all - a._count._all)) {
    console.log(
      `    ${String(row.status).padEnd(12)} ${String(row._count._all).padStart(4)}` +
        `   balance ₹${Number(row._sum.balance ?? 0).toLocaleString("en-IN")}`
    );
  }
  if (positiveBalance > 0 && sweepable === 0) {
    console.log(
      `\n  => There ARE overdue invoices with money owing, but none carry a\n` +
        `     chaseable status, so the sweep skips them. Re-seed to reset:  pnpm ai:seed`
    );
  }
}

async function verifySeededSettlementLedger(userId: string) {
  const cases = await prisma.recoveryCase.findMany({
    where: {
      OR: [{ ownerUserId: userId }, { invoice: { ownerUserId: userId } }],
      invoice: { invoiceNumber: { in: SEEDED_RECOVERED_INVOICES } },
    },
    select: {
      status: true,
      recoveredAmount: true,
      invoice: { select: { invoiceNumber: true, balance: true, status: true } },
      settlements: {
        select: {
          amount: true,
          attribution: true,
          payment: { select: { invoiceId: true, transactionId: true } },
        },
      },
    },
  });

  const valid =
    cases.length === SEEDED_RECOVERED_INVOICES.length &&
    cases.every((c) => {
      const settlementTotal = c.settlements.reduce((sum, settlement) => sum + Number(settlement.amount), 0);
      return (
        c.status === "PAID" &&
        c.invoice.status === "Paid" &&
        Number(c.invoice.balance) === 0 &&
        c.settlements.length === 1 &&
        c.settlements[0].attribution === "SEEDED_DEMO" &&
        c.settlements[0].payment.invoiceId !== null &&
        c.settlements[0].payment.transactionId?.startsWith("seed-recovered-") &&
        Math.abs(settlementTotal - Number(c.recoveredAmount)) < 0.005
      );
    });

  const amount = cases.reduce((sum, c) => sum + Number(c.recoveredAmount), 0);
  return {
    valid,
    detail: `${cases.length}/${SEEDED_RECOVERED_INVOICES.length} fixtures, ₹${amount.toLocaleString("en-IN")} ledger-backed`,
  };
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) throw new Error(`Demo user ${DEMO_EMAIL} not found — run the seed first.`);

  hr("POLICY LIMITS IN FORCE (lib/ai/policy/engine.ts)");
  for (const [k, v] of Object.entries(POLICY_LIMITS)) console.log(`  ${k.padEnd(24)} ${v}`);
  console.log(`  ${"CONTACT_ACTIONS".padEnd(24)} ${CONTACT_ACTIONS.join(", ")}`);

  const seededLedger = await verifySeededSettlementLedger(user.id);

  // ---------------------------------------------------------------- sweep 1
  hr("SWEEP 1 — safe dry-run portfolio");
  const first = await runRecoverySweep({ userId: user.id, trigger: "MANUAL", dryRun: true });
  console.log(
    `run #${first.runId}: ${first.totalInvoices} overdue invoices found, ` +
      `${first.processed} processed, ${first.simulatedActions} recommendations simulated\n`
  );

  if (first.totalInvoices === 0) {
    await diagnoseEmptySweep(user.id);
    process.exitCode = 1;
    return;
  }

  const firstRows = await readAudit(first.runId);
  printAudit(firstRows);

  // ------------------------------------------------------- opt-out compliance
  hr("OPT-OUT COMPLIANCE — flip one customer, re-sweep the same invoice");

  // Prefer an invoice the agent actually chose to *contact* on, so the BLOCK is
  // a genuine before/after rather than an invoice policy would have stopped anyway.
  const contacted = firstRows.find(
    (r) => CONTACT_ACTIONS.includes(r.actionType as never) && r.policyResult === "ALLOW"
  );
  const target = contacted ?? firstRows.find((r) => r.invoiceId !== null);
  if (!target?.invoiceId) throw new Error("No invoice with an audit row to test against.");

  const invoice = await prisma.invoice.findUnique({
    where: { id: target.invoiceId },
    select: { id: true, invoiceNumber: true, clientName: true, customerId: true },
  });
  if (!invoice?.customerId) throw new Error(`Invoice ${target.invoiceNumber} has no linked customer.`);

  console.log(`Sweep 1 decided: ${target.actionType} → ${target.policyResult} for ${target.clientName}`);
  await prisma.customer.update({
    where: { id: invoice.customerId },
    data: { communicationOptOut: true },
  });
  console.log(`Set communicationOptOut = true for "${invoice.clientName}".\n`);

  const second = await runRecoverySweep({
    userId: user.id,
    invoiceId: invoice.id,
    trigger: "MANUAL",
    dryRun: true,
  });
  console.log(`run #${second.runId} (invoice ${invoice.invoiceNumber}, customer now opted out):\n`);
  const secondRows = await readAudit(second.runId);
  printAudit(secondRows);

  const blocked = secondRows.find(
    (r) => r.policyResult === "BLOCK" && r.reasons.some((x) => x.toLowerCase().includes("opted out"))
  );

  // ------------------------------------------------------------------ verdict
  hr("VERDICT");
  const checks: Array<[string, boolean, string]> = [
    [
      "Seeded recovered revenue is settlement-ledger backed",
      seededLedger.valid,
      seededLedger.detail,
    ],
    ["Sweep produced decisions", first.processed > 0, `${first.processed} invoices processed`],
    [
      "Every processed invoice has an audit row",
      firstRows.length >= first.processed,
      `${firstRows.length} AgentAction rows / ${first.processed} processed`,
    ],
    [
      "Every audit row carries a policy verdict",
      firstRows.length > 0 && firstRows.every((r) => !!r.policyResult),
      [...new Set(firstRows.map((r) => r.policyResult))].join(", ") || "none",
    ],
    [
      "Agent differentiated strategy across customers",
      new Set(firstRows.map((r) => r.actionType)).size > 1,
      [...new Set(firstRows.map((r) => r.actionType))].join(", "),
    ],
    [
      "Opt-out BLOCKS a customer-contact action",
      !!blocked,
      blocked
        ? `${blocked.actionType} → BLOCK — "${blocked.reasons.join("; ")}"`
        : `no opt-out block found (got: ${secondRows.map((r) => `${r.actionType}/${r.policyResult}`).join(", ")})`,
    ],
  ];

  let ok = true;
  for (const [name, pass, detail] of checks) {
    if (!pass) ok = false;
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
  }

  // Reset so the script is re-runnable from a clean state.
  await prisma.customer.update({
    where: { id: invoice.customerId },
    data: { communicationOptOut: false },
  });
  console.log(`\n(reset communicationOptOut = false for "${invoice.clientName}")`);
  console.log(`\n${ok ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`);
  if (!ok) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

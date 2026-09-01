#!/usr/bin/env node
/**
 * Learning-Loop Live Proof (runs fully locally, no LLM / email needed)
 * ===================================================================
 * Makes the pitch claim observable in ~10 seconds:
 *
 *   "You can literally see it change its mind about which strategy
 *    works for which customer segment."
 *
 * What it does:
 *   ROUND 0 — asks the decision agent for a plan with NO outcome history.
 *   EVIDENCE — crafts a realistic outcome history on a throwaway portfolio:
 *       MEDIUM-risk: reminders converted well, payment links didn't.
 *       LOW-risk:    payment links converted great, reminders mediocre.
 *   ROUND 1 — asks again, now WITH the learning-loop stats.
 *
 * Output: side-by-side decisions + the exact reason strings where the
 * agent flipped ("Learning loop: ... best conversion history ...").
 *
 * All data is tagged invoice numbers `SIMLRN-*` and cleaned up on re-runs,
 * so your seeded demo portfolio stays untouched.
 *
 * Run:  pnpm ai:demo-learning
 */
import { prisma } from "../../lib/db";
import { buildRecoveryContext } from "../../lib/ai/context";
import { decideRecoveryAction } from "../../lib/ai/agent/decision-agent";
import { getStrategyStats, MIN_SAMPLE_SIZE } from "../../lib/ai/learning";
import { createLogger } from "../../lib/ai/logger";
import { LOCAL_HACKATHON_DEMO } from "../../lib/demo-account";

// Deterministic rules agent for reproducibility (no network dependency).
process.env.DISABLE_LLM_AGENT = "true";

const log = createLogger("ai:demo-learning");
const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL || LOCAL_HACKATHON_DEMO.email;
const PREFIX = "SIMLRN";

type PlanRow = { label: string; action: string; reason: string };

function planTable(title: string, rows: PlanRow[]) {
  console.log(`\n${title}`);
  console.log("─".repeat(78));
  for (const r of rows) {
    console.log(`${r.label.padEnd(22)} → ${r.action.padEnd(20)} ${r.reason.slice(0, 52)}`);
  }
}

async function findDemoUser() {
  const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) {
    throw new Error(
      `Demo user ${DEMO_EMAIL} not found. Run \`pnpm ai:seed\` first.`,
    );
  }
  return user;
}

async function cleanupPreviousRuns(ownerUserId: string) {
  const stale = await prisma.invoice.findMany({
    where: { ownerUserId, invoiceNumber: { startsWith: `${PREFIX}-` } },
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.invoice.deleteMany({
      where: { id: { in: stale.map((s) => s.id) } },
    });
    console.log(`Cleaned ${stale.length} invoice(s) from previous runs.`);
  }
}

async function makeCase(args: {
  userId: string;
  seg: "LOW" | "MED";
  idx: number;
  amount: number;
  /** Creates this many past on-time Paid invoices so the ML model scores the customer as genuinely low-risk. */
  withGoodHistory?: number;
}) {
  const clientEmail = `${PREFIX.toLowerCase()}${args.idx}@demo.test`;
  const invoice = await prisma.invoice.create({
    data: {
      customer: `Sim Customer ${args.seg}${args.idx}`,
      clientName: `Sim Customer ${args.seg}${args.idx}`,
      clientEmail,
      ownerUserId: args.userId,
      invoiceNumber: `${PREFIX}-${args.seg}-${args.idx}`,
      amount: args.amount,
      subtotal: args.amount,
      total: args.amount,
      amountPaid: 0,
      balance: args.amount,
      status: "Pending",
      currency: "INR",
      dueDate: new Date(Date.now() - 10 * 86400000),
    },
  });

  // Positive payment history: the context builder matches history by
  // clientEmail, so these shape paymentSuccessRate / avgDelay features.
  const histCount = args.withGoodHistory ?? 0;
  for (let h = 0; h < histCount; h++) {
    const due = new Date(Date.now() - (60 + h * 30) * 86400000);
    await prisma.invoice.create({
      data: {
        customer: `Sim Customer ${args.seg}${args.idx}`,
        clientName: `Sim Customer ${args.seg}${args.idx}`,
        clientEmail,
        ownerUserId: args.userId,
        invoiceNumber: `${PREFIX}-H-${args.seg}-${args.idx}-${h}`,
        amount: 9000,
        subtotal: 9000,
        total: 9000,
        amountPaid: 9000,
        balance: 0,
        status: "Paid",
        currency: "INR",
        date: new Date(due.getTime() - 3 * 86400000),
        dueDate: due,
      },
    });
    await prisma.payment.create({
      data: {
        invoiceId: (
          await prisma.invoice.findFirst({
            where: { invoiceNumber: `${PREFIX}-H-${args.seg}-${args.idx}-${h}` },
            select: { id: true },
          })
        )!.id,
        amount: 9000,
        method: "SIM history",
        transactionId: `${PREFIX}-hist-${args.idx}-${h}`,
        date: new Date(due.getTime() - 1 * 86400000),
      },
    });
  }

  const rc = await prisma.recoveryCase.create({
    data: { invoiceId: invoice.id, ownerUserId: args.userId, status: "OPEN", stage: "SCORING", riskScore: args.seg === "MED" ? 0.55 : 0.25 },
  });
  return { invoiceId: invoice.id, caseId: rc.id };
}

async function creditExecutedAction(caseId: number, invoiceId: number, action: string, riskLevel: string) {
  await prisma.agentAction.create({
    data: {
      recoveryCaseId: caseId,
      invoiceId,
      actionType: action,
      channel: "EMAIL",
      riskScore: riskLevel === "MEDIUM" ? 0.55 : 0.25,
      policyResult: "ALLOW",
      policyReasons: ["Simulation"],
      status: "EXECUTED",
      executionStatus: "EXECUTED",
      provider: "sim-demo",
      reason: "Simulated historical attempt",
      completedAt: new Date(),
    },
  });
}

async function resolveAsPaid(invoiceId: number, caseId: number, amount: number) {
  await prisma.payment.create({
    data: {
      invoiceId,
      amount,
      method: "Razorpay (SIM)",
      transactionId: `${PREFIX}-pay-${invoiceId}`,
      date: new Date(),
    },
  });
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: "Paid", amountPaid: amount, balance: 0 },
  });
  await prisma.recoveryCase.update({
    where: { id: caseId },
    data: { status: "PAID", stage: "RESOLVED", resolvedAt: new Date(), lastDecision: "SIMULATED_WIN" },
  });
}

async function backdateStale(caseId: number) {
  // Losses only count when the case has been idle >7 days.
  await prisma.$executeRaw`
    UPDATE "RecoveryCase" SET "updatedAt" = NOW() - INTERVAL '9 days' WHERE id = ${caseId}
  `;
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║     Learning Loop — Live Proof  (local, deterministic)        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  const user = await findDemoUser();
  await cleanupPreviousRuns(user.id);

  // ── ROUND 0: no evidence ────────────────────────────────────────────────
  // Two showcase cases per segment stay OPEN for the before/after compare.
  const showcases = [
    { seg: "MED" as const, amount: 32000 },
    { seg: "MED" as const, amount: 28000 },
    { seg: "LOW" as const, amount: 15000, withGoodHistory: 8 },
    { seg: "LOW" as const, amount: 12000, withGoodHistory: 8 },
  ];
  const showcaseCases = [];
  for (let i = 0; i < showcases.length; i++) {
    const s = showcases[i];
    showcaseCases.push({
      ...(await makeCase({
        userId: user.id,
        seg: s.seg,
        idx: 100 + i,
        amount: s.amount,
        withGoodHistory: (s as { withGoodHistory?: number }).withGoodHistory,
      })),
      seg: s.seg,
    });
  }

  const round0: PlanRow[] = [];
  for (const sc of showcaseCases) {
    const ctx = await buildRecoveryContext(sc.invoiceId);
    const d = await decideRecoveryAction({ context: ctx, priorActions: [] });
    round0.push({
      label: `${sc.seg}(model:${ctx.risk.riskLevel}) · #${sc.invoiceId}`,
      action: d.recommendedAction,
      reason: d.reason,
    });
  }
  planTable("ROUND 0 — decisions with NO outcome history:", round0);

  // ── EVIDENCE: craft honest conversion history ───────────────────────────
  console.log("\nBuilding outcome history on a throwaway portfolio…");
  let seq = 0;
  async function historyBatch(seg: "LOW" | "MED", action: string, wins: number, losses: number, amount: number) {
    for (let w = 0; w < wins; w++) {
      const c = await makeCase({ userId: user.id, seg, idx: ++seq, amount });
      await creditExecutedAction(c.caseId, c.invoiceId, action, seg === "MED" ? "MEDIUM" : "LOW");
      await resolveAsPaid(c.invoiceId, c.caseId, amount);
    }
    for (let l = 0; l < losses; l++) {
      const c = await makeCase({ userId: user.id, seg, idx: ++seq, amount });
      await creditExecutedAction(c.caseId, c.invoiceId, action, seg === "MED" ? "MEDIUM" : "LOW");
      await backdateStale(c.caseId);
    }
  }

  // MEDIUM: reminders proved strong, links weak.
  await historyBatch("MED", "SEND_REMINDER", 4, 1, 30000);
  await historyBatch("MED", "CREATE_PAYMENT_LINK", 1, 3, 30000);
  // LOW: links proved excellent, reminders mediocre.
  await historyBatch("LOW", "CREATE_PAYMENT_LINK", 4, 0, 14000);
  await historyBatch("LOW", "SEND_REMINDER", 2, 3, 14000);

  const stats = await getStrategyStats(user.id);
  console.log("\nEVIDENCE — learned win-rates (min sample " + MIN_SAMPLE_SIZE + " to trust):");
  console.log("─".repeat(78));
  for (const s of stats.overall.filter((x) => x.attempts >= MIN_SAMPLE_SIZE)) {
    console.log(
      `${s.riskLevel.padEnd(7)} ${short(s.actionType).padEnd(16)} ${s.wins}W/${s.attempts} → ${(s.winRate * 100).toFixed(0)}%`,
    );
  }
  function short(a: string) {
    return a.replace("CREATE_PAYMENT_LINK", "Pay Link").replace("SEND_REMINDER", "Reminder").replace("RESEND_PAYMENT_LINK", "Resend").replace("ESCALATE_TO_HUMAN", "Human");
  }

  // ── ROUND 1: same cases, WITH evidence ──────────────────────────────────
  const round1: PlanRow[] = [];
  let flips = 0;
  for (let i = 0; i < showcaseCases.length; i++) {
    const ctx = await buildRecoveryContext(showcaseCases[i].invoiceId);
    const d = await decideRecoveryAction({ context: ctx, priorActions: [], strategyStats: stats });
    const changed = round0[i].action !== d.recommendedAction;
    if (changed) flips++;
    round1.push({
      label: `${changed ? "🔁" : "  "} ${showcaseCases[i].seg}(model:${ctx.risk.riskLevel}) · #${showcaseCases[i].invoiceId}`,
      action: d.recommendedAction,
      reason: d.reason,
    });
  }
  planTable(`ROUND 1 — same invoices, WITH learning-loop evidence (${flips} mind-change[s]):`, round1);

  console.log("\nWhat just happened:");
  console.log("• The agent kept its safety spine — policy gates untouched.");
  console.log("• Mid-funnel strategy per model-scored segment moved toward PROVEN winners:");
  for (const [level, action] of Object.entries(stats.byRiskLevel)) {
    console.log(`    ${level.padEnd(7)} → ${short(action)}`);
  }
  console.log("• Every flip carries an auditable reason string — shown above.");
  console.log("\nIn production the same loop feeds on REAL Razorpay webhook payouts.");
  console.log("Dashboard → AI Recovery → Analytics renders this evidence as charts.");
  console.log("(SIMLRN-* rows are simulation data; they power your local Analytics");
  console.log(" view. Re-running this script resets them.)\n");

  await prisma.$disconnect();
}

main().catch((err) => {
  log.error(String(err instanceof Error ? err.message : err));
  console.error("\nIf the database is unreachable locally, run this where DATABASE_URL is reachable:");
  console.error("  pnpm ai:demo-learning\n");
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Evaluation Harness (Roadmap Phase 12)
 * =====================================
 * Answers the judge question: "Does the AI actually recover MORE money than
 * plain reminders?" by running both strategies over an identical simulated
 * invoice portfolio with a Monte Carlo outcome model.
 *
 * Strategies compared:
 *   BASELINE — flat reminder to every overdue invoice (45% payment odds).
 *   AI       — ML risk score → rules decision agent → policy gate; outcome
 *              probability derived from the model's own paymentProbability
 *              and the chosen action type.
 *
 * Both use identical customer profiles and the same RNG seed, so any delta
 * comes from strategy, not luck.
 *
 * ⚠️ HONESTY LABEL: results are from a SIMULATED outcome model, not live
 * payments. The script prints this label on every report so numbers are
 * never presented as real-world measurements.
 *
 * Run:  pnpm ai:evaluate
 */
import { scoreRisk } from "../../lib/ai/ml/risk-model";
import { rulesDecision } from "../../lib/ai/agent/decision-agent";
import { evaluatePolicy, POLICY_LIMITS, CONTACT_ACTIONS } from "../../lib/ai/policy/engine";
import type { ContactHistory } from "../../lib/ai/policy/engine";
import type { RecoveryContext } from "../../lib/ai/context";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

// ── Seeded RNG (mulberry32) so runs are reproducible ────────────────────────
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Portfolio generator: 5 customer archetypes × N invoices each ───────────
type Profile = {
  name: string;
  amountDue: number;
  daysOverdue: number;
  historyCount: number;
  latePayments: number;
  successRate: number;
  avgDelayDays: number;
};

const ARCHETYPES: Profile[] = [
  // Reliable payer, small slip
  { name: "Reliable", amountDue: 15000, daysOverdue: 5, historyCount: 14, latePayments: 1, successRate: 0.93, avgDelayDays: 1.5 },
  // Average B2B
  { name: "Average", amountDue: 32000, daysOverdue: 12, historyCount: 9, latePayments: 3, successRate: 0.7, avgDelayDays: 4 },
  // Chronic lateguy, mid ticket
  { name: "Chronic-Late", amountDue: 28000, daysOverdue: 30, historyCount: 11, latePayments: 8, successRate: 0.35, avgDelayDays: 18 },
  // High-value whale at risk → should hit approval gate
  { name: "High-Value", amountDue: 120000, daysOverdue: 20, historyCount: 6, latePayments: 2, successRate: 0.65, avgDelayDays: 6 },
  // Ghosted new customer
  { name: "Ghost-New", amountDue: 8500, daysOverdue: 40, historyCount: 1, latePayments: 1, successRate: 0.15, avgDelayDays: 25 },
];

function buildPortfolio(repsPerArchetype: number): Profile[] {
  const portfolio: Profile[] = [];
  for (let i = 0; i < repsPerArchetype; i++) {
    for (const a of ARCHETYPES) portfolio.push({ ...a });
  }
  return portfolio;
}

function ctxFor(p: Profile): RecoveryContext {
  const risk = scoreRisk({
    amountDue: p.amountDue,
    daysOverdue: p.daysOverdue,
    customerAgeDays: 400,
    previousInvoiceCount: p.historyCount,
    previousLatePayments: p.latePayments,
    averagePaymentDelayDays: p.avgDelayDays,
    paymentSuccessRate: p.successRate,
    previousReminders: 0,
    isVipExempt: false,
    cibilScore: 700,
    humanEngaged: false,
  });

  const base = {
    invoice: { id: 1, invoiceNumber: "SIM-1", clientName: p.name, clientEmail: "", clientPhone: "", total: p.amountDue, amountPaid: 0, balance: p.amountDue, currency: "INR", status: "Pending", dueDate: null, daysOverdue: p.daysOverdue, customerId: null, razorpayPaymentLinkId: null, razorpayPaymentLinkUrl: null },
    customer: { id: null, name: p.name, email: "", isVipExempt: false, cibilScore: 700, previousInvoiceCount: p.historyCount, previousLatePayments: p.latePayments, averagePaymentDelayDays: p.avgDelayDays, paymentSuccessRate: p.successRate, customerAgeDays: 400, historyCount: p.historyCount },
    risk,
    features: {} as never,
  };
  return base as unknown as RecoveryContext;
}

// ── Outcome models (documented assumptions) ─────────────────────────────────
const BASELINE_PAYMENT_ODDS = 0.45;
const ACTION_ODDS: Record<string, (p: number) => number> = {
  SEND_REMINDER: (payProb) => 0.2 + 0.3 * payProb,
  CREATE_PAYMENT_LINK: (payProb) => 0.22 + 0.42 * payProb, // friction removal helps
  RESEND_PAYMENT_LINK: (payProb) => 0.2 + 0.38 * payProb,
  SCHEDULE_FOLLOWUP: (payProb) => 0.15 + 0.32 * payProb,
  // Human touch adds a real bump over automated channels, but a chronic
  // non-payer still often won't pay even when a human calls.
  ESCALATE_TO_HUMAN: (payProb) => 0.25 + 0.45 * payProb,
  STOP: () => 0,
};
const DAYS_TO_PAY: Record<string, number> = {
  SEND_REMINDER: 9,
  CREATE_PAYMENT_LINK: 4,
  RESEND_PAYMENT_LINK: 5,
  SCHEDULE_FOLLOWUP: 12,
  ESCALATE_TO_HUMAN: 3,
  STOP: Infinity,
};
const HUMAN_APPROVAL_DAYS = 1; // merchant approves next morning

// Each autonomous round models a later calendar day. The gap is wider than the
// policy cooldown so the simulation *respects* the cooldown (never false-blocks
// on it) while the bound that actually bites is the max-contact-attempts cap —
// making the "stopping rules" visible as BLOCKED / EXHAUSTED outcomes.
const BASE_EPOCH = Date.UTC(2026, 0, 1);
const ROUND_GAP_HOURS = POLICY_LIMITS.contactCooldownHours + 24;
const MAX_ROUNDS = POLICY_LIMITS.maxContactAttempts + 1; // one past the cap
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

type Outcome = { paid: boolean; days: number };
type AiOutcome = Outcome & { action: string; contactTouches: number };

function simulateBaseline(p: Profile, rng: () => number): Outcome {
  if (rng() < BASELINE_PAYMENT_ODDS) {
    return { paid: true, days: Math.max(1, Math.round(p.avgDelayDays + rng() * 6)) };
  }
  return { paid: false, days: Infinity };
}

/**
 * Bounded multi-round agent: risk → rules decision → policy gate, repeated over
 * successive days until the invoice is paid, the policy stops it, or the round
 * budget is exhausted. History (attempts / cooldown / escalations) is threaded
 * through so the engine's stopping rules apply exactly as they do in production.
 */
function simulateAi(p: Profile, rng: () => number): AiOutcome {
  const context = ctxFor(p);
  const priorActions: string[] = [];

  let contactAttempts = 0;
  let lastContactAt: Date | null = null;
  const escalationTimes: number[] = [];
  let contactTouches = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const now = new Date(BASE_EPOCH + round * ROUND_GAP_HOURS * HOUR_MS);
    const escalationsToday = escalationTimes.filter((t) => now.getTime() - t < DAY_MS).length;
    const history: ContactHistory = { now, contactAttempts, lastContactAt, escalationsToday };

    const decision = rulesDecision({ context, priorActions });
    const verdict = evaluatePolicy({ context, decision, history });

    if (verdict.decision === "BLOCK") {
      return { paid: false, days: Infinity, action: `BLOCKED(${decision.recommendedAction})`, contactTouches };
    }

    const action = decision.recommendedAction;
    if (action === "STOP") return { paid: false, days: Infinity, action: "STOP", contactTouches };

    let extraDays = 0;
    if (verdict.decision === "REQUIRE_HUMAN_APPROVAL") {
      if (rng() > 0.85) return { paid: false, days: Infinity, action: `UNAPPROVED(${action})`, contactTouches };
      extraDays = HUMAN_APPROVAL_DAYS;
    }

    const isContact = CONTACT_ACTIONS.includes(action);
    if (isContact) contactTouches += 1;

    const payProb = context.risk.paymentProbability;
    const odds = (ACTION_ODDS[action] ?? (() => 0.3))(payProb);
    if (rng() < odds) {
      return { paid: true, days: extraDays + (DAYS_TO_PAY[action] ?? 8), action, contactTouches };
    }

    // Not paid → record the attempt so the bounds accrue for the next round.
    priorActions.push(action);
    if (isContact) {
      contactAttempts += 1;
      lastContactAt = now;
    }
    if (action === "ESCALATE_TO_HUMAN") escalationTimes.push(now.getTime());
  }
  return { paid: false, days: Infinity, action: "EXHAUSTED", contactTouches };
}

// ── Report ──────────────────────────────────────────────────────────────────
function report(label: string, o: Outcome[], amounts: number[]) {
  // Sum the amounts of the invoices that were actually paid (indexed against
  // the original portfolio), and always measure share against the full
  // at-risk total so both arms use the same denominator.
  let recovered = 0;
  let paidCount = 0;
  let daysSum = 0;
  for (let i = 0; i < o.length; i++) {
    if (o[i].paid) {
      recovered += amounts[i];
      paidCount += 1;
      daysSum += o[i].days;
    }
  }
  const totalAtRisk = amounts.reduce((a, b) => a + b, 0);
  const avgDays = paidCount > 0 ? daysSum / paidCount : NaN;

  return {
    label,
    recoveryRate: paidCount / o.length,
    recoveredAmount: recovered,
    totalAtRisk,
    recoveryShare: recovered / totalAtRisk,
    avgDaysToPay: avgDays,
    count: o.length,
  };
}

function getArg(argv: string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  if (i === -1 || i + 1 >= argv.length) return null;
  const val = argv[i + 1];
  return val.startsWith("--") ? null : val;
}

function main() {
  const SEED = 20260822;
  const REPS = 200; // 200 × 5 archetypes = 1000 invoices per arm
  const portfolio = buildPortfolio(REPS);
  const amounts = portfolio.map((p) => p.amountDue);

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║   InvoNotify AI — Strategy Evaluation (SIMULATED outcomes)   ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\nPortfolio: ${portfolio.length} overdue invoices | ₹${amounts.reduce((a, b) => a + b, 0).toLocaleString("en-IN")} at risk`);
  console.log(`Seed: ${SEED} | Archetypes: ${ARCHETYPES.map((a) => `${a.name}×${REPS}`).join(", ")}\n`);

  // Baseline arm
  const rngB = mulberry32(SEED);
  const baselineOutcomes = portfolio.map((p) => simulateBaseline(p, rngB));

  // AI arm (same portfolio; independent seeded stream)
  const rngA = mulberry32(SEED);
  const aiOutcomes = portfolio.map((p) => simulateAi(p, rngA));

  const b = report("BASELINE (flat reminder)", baselineOutcomes, amounts);
  const a = report("AI (risk→decision→policy)", aiOutcomes, amounts);

  const fmt = (r: ReturnType<typeof report>) =>
    [
      `  ${r.label}`,
      `  Invoices evaluated : ${r.count}`,
      `  Recovered          : ${r.recoveredAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })} of ₹${Math.round(r.totalAtRisk).toLocaleString("en-IN")}`,
      `  Recovery rate      : ${(r.recoveryRate * 100).toFixed(1)}%`,
      `  ₹-weighted share   : ${(r.recoveryShare * 100).toFixed(1)}%`,
      `  Avg days to pay    : ${Number.isFinite(r.avgDaysToPay) ? r.avgDaysToPay.toFixed(1) : "—"}`,
    ].join("\n");

  console.log("┌─────────────────────────────────────────┐");
  console.log(fmt(b));
  console.log("├─────────────────────────────────────────┤");
  console.log(fmt(a));
  console.log("└─────────────────────────────────────────┘");

  const deltaRate = a.recoveryRate - b.recoveryRate;
  const deltaAmt = a.recoveredAmount - b.recoveredAmount;
  console.log(`\nΔ Recovery rate : ${deltaRate >= 0 ? "+" : ""}${(deltaRate * 100).toFixed(1)} pts`);
  console.log(`Δ Recovered     : ₹${Math.round(deltaAmt).toLocaleString("en-IN")}`);
  console.log(`Δ Avg days      : ${(Number.isFinite(a.avgDaysToPay) ? a.avgDaysToPay : 0) - (Number.isFinite(b.avgDaysToPay) ? b.avgDaysToPay : 0) >= 0 ? "" : ""}${((a.avgDaysToPay || 0) - (b.avgDaysToPay || 0)).toFixed(1)} days`);

  // Per-archetype breakdown for the AI arm
  console.log("\nAI per-archetype recovery:");
  for (const arch of ARCHETYPES) {
    const idxs = portfolio.map((p, i) => (p.name === arch.name ? i : -1)).filter((i) => i >= 0);
    const paidN = idxs.filter((i) => aiOutcomes[i].paid).length;
    const actionsTally: Record<string, number> = {};
    idxs.forEach((i) => {
      const act = (aiOutcomes[i] as Outcome & { action: string }).action;
      actionsTally[act] = (actionsTally[act] ?? 0) + 1;
    });
    const topActions = Object.entries(actionsTally)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 2)
      .map(([k, v]) => `${k}:${v}`)
      .join(" ");
    console.log(
      `  ${arch.name.padEnd(12)} ${paidN}/${idxs.length} recovered (${((paidN / idxs.length) * 100).toFixed(0)}%)  decisions: ${topActions}`,
    );
  }

  // ── Fourth judge metric: customer touches per recovered invoice ──────────
  const aiPaid = aiOutcomes.filter((o) => o.paid);
  const contactsPerRecovery = aiPaid.length
    ? aiPaid.reduce((s, o) => s + o.contactTouches, 0) / aiPaid.length
    : 0;

  // Bounded-outcome tally — proof the policy actually stops the agent.
  const boundedOutcomes = { blocked: 0, stopped: 0, exhausted: 0, unapproved: 0 };
  for (const o of aiOutcomes) {
    if (o.action.startsWith("BLOCKED(")) boundedOutcomes.blocked += 1;
    else if (o.action === "STOP") boundedOutcomes.stopped += 1;
    else if (o.action === "EXHAUSTED") boundedOutcomes.exhausted += 1;
    else if (o.action.startsWith("UNAPPROVED(")) boundedOutcomes.unapproved += 1;
  }

  console.log(`\nContacts per recovery (AI) : ${contactsPerRecovery.toFixed(2)}  (bound: ≤ ${POLICY_LIMITS.maxContactAttempts} attempts/case)`);
  console.log(
    `Bounded outcomes           : ${boundedOutcomes.blocked} blocked · ${boundedOutcomes.exhausted} exhausted · ${boundedOutcomes.stopped} stopped · ${boundedOutcomes.unapproved} unapproved`,
  );

  // ── Emit machine-readable metrics for the docs to cite ───────────────────
  const jsonPath = getArg(process.argv, "--json") ?? "docs/eval-metrics.json";
  const metrics = {
    generatedAt: new Date().toISOString(),
    simulated: true,
    seed: SEED,
    portfolioSize: portfolio.length,
    rounds: { maxRounds: MAX_ROUNDS, gapHours: ROUND_GAP_HOURS, cooldownHours: POLICY_LIMITS.contactCooldownHours },
    policyLimits: POLICY_LIMITS,
    baseline: b,
    ai: a,
    deltas: {
      recoveryRatePts: (a.recoveryRate - b.recoveryRate) * 100,
      recoveredAmount: a.recoveredAmount - b.recoveredAmount,
      avgDaysToPay:
        (Number.isFinite(a.avgDaysToPay) ? a.avgDaysToPay : 0) -
        (Number.isFinite(b.avgDaysToPay) ? b.avgDaysToPay : 0),
    },
    contactsPerRecovery,
    boundedOutcomes,
  };
  const outAbs = path.resolve(process.cwd(), jsonPath);
  mkdirSync(path.dirname(outAbs), { recursive: true });
  writeFileSync(outAbs, JSON.stringify(metrics, null, 2) + "\n");
  console.log(`Metrics written to ${jsonPath}`);

  console.log("\n⚠️  SIMULATED OUTCOME MODEL — not live payment data.");
  console.log("   Assumptions documented in scripts/ai/evaluate-recovery.ts");
  console.log("   Baseline odds: 45% flat. AI odds: f(model paymentProbability, action).");
  console.log(`   AI runs a bounded ${MAX_ROUNDS}-round chase (≤ ${POLICY_LIMITS.maxContactAttempts} contacts/case, ${POLICY_LIMITS.contactCooldownHours}h cooldown); baseline is a single flat reminder.\n`);
}

main();
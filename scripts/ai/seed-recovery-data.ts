/**
 * Seeds demo data for the AI Revenue Recovery dashboard.
 *
 * Idempotent: every row is upserted on a deterministic key, so running this
 * repeatedly refreshes the demo data in place instead of piling up duplicates.
 * It only ever touches rows owned by the demo user.
 *
 * The dataset is deliberately shaped to exercise every branch of the Phase 12
 * policy engine, so the dashboard demonstrates the judge rubric end to end:
 *
 *   - normal overdue invoices          -> ALLOW, agent contacts the customer
 *   - balances over the auto limit     -> REQUIRE_HUMAN_APPROVAL
 *   - a customer who opted out         -> BLOCK (compliance)
 *   - a balance under the cost floor   -> BLOCK (stopping rule)
 *   - already-recovered invoices       -> populates the "Recovered" tile
 *   - a part-paid invoice              -> recovery on a residual balance
 *   - invoices not yet due             -> proves the sweep leaves them alone
 *
 * Recovered cases carry a short pre-baked audit trail so the case detail view
 * is not empty. Those rows are tagged `payload.seeded = true` so seeded history
 * can never be mistaken for a real measured agent run.
 *
 * Run with:
 *   pnpm ai:seed
 *   pnpm ai:seed -- --prune    # also drop demo invoices this script no longer defines
 */
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { settleInvoicePayment } from "../../lib/payments/settle-invoice-payment";
import { LOCAL_HACKATHON_DEMO } from "../../lib/demo-account";

const prisma = new PrismaClient();

// Deliberately non-routable local credentials. The short password is accepted
// only by the local login alias and is never enabled in production. This is an
// InvoNotify simulation, not a Razorpay account.
const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL || LOCAL_HACKATHON_DEMO.email;
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || LOCAL_HACKATHON_DEMO.password;
const DAY = 86_400_000;

/**
 * Opt-in only. Earlier versions of this script generated invoice numbers with
 * Math.random(), so re-running it left orphan rows behind that inflate the
 * dashboard totals. `--prune` clears them. It is deliberately NOT the default:
 * DEMO_EMAIL may be a real account and DATABASE_URL may point at a real
 * database, and deleting a live merchant's invoices would be unrecoverable.
 */
const PRUNE = process.argv.includes("--prune");

type Profile = {
  name: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  cibil: number;
  /** How many of the historical invoices were paid late (shapes risk features). */
  late: number;
  /** Total historical (already paid) invoices for this customer. */
  history: number;
  optOut?: boolean;
  vip?: boolean;
};

const PROFILES: Profile[] = [
  { name: "Acme Traders",        email: "acme@example.com",    phone: "+919000000001", city: "Ahmedabad", state: "Gujarat",     cibil: 720, late: 2, history: 8 },
  { name: "Beta Industries",     email: "beta@example.com",    phone: "+919000000002", city: "Pune",      state: "Maharashtra", cibil: 580, late: 6, history: 8 },
  { name: "Gamma Retail",        email: "gamma@example.com",   phone: "+919000000003", city: "Surat",     state: "Gujarat",     cibil: 810, late: 0, history: 8 },
  { name: "Delta Logistics",     email: "delta@example.com",   phone: "+919000000004", city: "Chennai",   state: "Tamil Nadu",  cibil: 620, late: 4, history: 8 },
  { name: "Epsilon Foods",       email: "epsilon@example.com", phone: "+919000000005", city: "Indore",    state: "MP",          cibil: 700, late: 3, history: 8 },
  // Opted out of all communication -> every contact action must be BLOCKED.
  { name: "Zeta Pharma",         email: "zeta@example.com",    phone: "+919000000006", city: "Hyderabad", state: "Telangana",   cibil: 690, late: 3, history: 6, optOut: true },
  // VIP: large balances, handled by a human rather than auto-chased.
  { name: "Omega Constructions", email: "omega@example.com",   phone: "+919000000007", city: "Mumbai",    state: "Maharashtra", cibil: 750, late: 1, history: 6, vip: true },
  { name: "Kappa Textiles",      email: "kappa@example.com",   phone: "+919000000008", city: "Ludhiana",  state: "Punjab",      cibil: 660, late: 3, history: 6 },
  { name: "Sigma Electronics",   email: "sigma@example.com",   phone: "+919000000009", city: "Noida",     state: "UP",          cibil: 540, late: 7, history: 8 },
];

type InvoiceSpec = {
  customer: string;
  number: string;
  amount: number;
  kind: "OVERDUE" | "RECOVERED" | "PARTIAL" | "UPCOMING";
  /** Days past the due date (OVERDUE / PARTIAL / RECOVERED). */
  daysOverdue?: number;
  /** Days until the due date (UPCOMING). */
  daysUntilDue?: number;
  /** For PARTIAL: how much has already been collected. */
  paidSoFar?: number;
  /** For RECOVERED: how many days ago the money landed. */
  recoveredDaysAgo?: number;
  /** Why this row is in the demo set — printed in the seed summary. */
  demonstrates: string;
};

const INVOICES: InvoiceSpec[] = [
  // --- Open overdue invoices: the sweep's working set ------------------------
  { customer: "Acme Traders",        number: "ACM-1001", amount: 24_500,  kind: "OVERDUE", daysOverdue: 7,  demonstrates: "low risk, recently overdue -> gentle reminder" },
  { customer: "Beta Industries",     number: "BET-1002", amount: 124_000, kind: "OVERDUE", daysOverdue: 21, demonstrates: "over the auto-money limit -> REQUIRE_HUMAN_APPROVAL" },
  { customer: "Gamma Retail",        number: "GAM-1003", amount: 12_000,  kind: "OVERDUE", daysOverdue: 3,  demonstrates: "excellent payer -> cheapest possible nudge" },
  { customer: "Delta Logistics",     number: "DEL-1004", amount: 82_000,  kind: "OVERDUE", daysOverdue: 35, demonstrates: "high value + chronic late payer -> approval + escalation" },
  { customer: "Epsilon Foods",       number: "EPS-1005", amount: 39_000,  kind: "OVERDUE", daysOverdue: 12, demonstrates: "mid risk -> payment link" },
  { customer: "Zeta Pharma",         number: "ZET-1006", amount: 31_000,  kind: "OVERDUE", daysOverdue: 9,  demonstrates: "customer opted out -> BLOCK on every contact action" },
  { customer: "Omega Constructions", number: "OMG-1007", amount: 210_000, kind: "OVERDUE", daysOverdue: 44, demonstrates: "VIP, very high value -> human approval, never auto-chased" },
  { customer: "Kappa Textiles",      number: "KAP-1008", amount: 150,     kind: "OVERDUE", daysOverdue: 18, demonstrates: "below the cost-to-recover floor -> stop chasing" },
  { customer: "Sigma Electronics",   number: "SIG-1009", amount: 57_500,  kind: "OVERDUE", daysOverdue: 61, demonstrates: "worst risk profile, long overdue -> escalate to human" },

  // --- Already recovered: gives the "Recovered" tile a real number -----------
  { customer: "Acme Traders",  number: "ACM-1010", amount: 18_000, kind: "RECOVERED", daysOverdue: 9,  recoveredDaysAgo: 2, demonstrates: "recovered after a reminder" },
  { customer: "Gamma Retail",  number: "GAM-1011", amount: 45_000, kind: "RECOVERED", daysOverdue: 14, recoveredDaysAgo: 4, demonstrates: "recovered after a payment link" },
  { customer: "Epsilon Foods", number: "EPS-1012", amount: 22_500, kind: "RECOVERED", daysOverdue: 6,  recoveredDaysAgo: 1, demonstrates: "recovered same week" },

  // --- Part paid: recovery has to work on the residual balance ---------------
  { customer: "Delta Logistics", number: "DEL-1013", amount: 60_000, kind: "PARTIAL", daysOverdue: 14, paidSoFar: 25_000, demonstrates: "part payment -> chase the ₹35,000 residual only" },

  // --- Not yet due: must be ignored by the sweep -----------------------------
  { customer: "Acme Traders", number: "ACM-1014", amount: 30_000, kind: "UPCOMING", daysUntilDue: 10, demonstrates: "not due yet -> correctly ignored by the sweep" },
  { customer: "Gamma Retail", number: "GAM-1015", amount: 9_000,  kind: "UPCOMING", daysUntilDue: 4,  demonstrates: "not due yet -> correctly ignored by the sweep" },
];

const PRODUCTS = [
  { name: "Consulting — Standard",   description: "Per-day professional services",  basePrice: 12_000, hsnCode: "998311", defaultTaxRate: 18 },
  { name: "Consulting — Premium",    description: "Per-day senior advisory",        basePrice: 25_000, hsnCode: "998311", defaultTaxRate: 18 },
  { name: "Annual Support Contract", description: "12 months of support and SLA",   basePrice: 60_000, hsnCode: "998313", defaultTaxRate: 18 },
  { name: "Onboarding & Setup",      description: "One-time implementation fee",    basePrice: 18_000, hsnCode: "998313", defaultTaxRate: 18 },
  { name: "Hardware — Router",       description: "Enterprise-grade network router", basePrice: 8_500,  hsnCode: "851762", defaultTaxRate: 12 },
];

/**
 * Judge-facing previews of what the agent would send or escalate. They are
 * persisted as SIMULATED actions, tagged `seeded`, and never call an email,
 * WhatsApp, SMS, voice, payment, or Razorpay provider.
 */
const NOTIFICATION_PREVIEWS: Record<
  string,
  {
    actionType: string;
    channel: string;
    policyResult: "ALLOW" | "BLOCK" | "REQUIRE_HUMAN_APPROVAL";
    title: string;
    message: string;
  }
> = {
  "ACM-1001": {
    actionType: "SEND_REMINDER",
    channel: "EMAIL",
    policyResult: "ALLOW",
    title: "Friendly invoice reminder",
    message: "Hi Acme Traders — invoice ACM-1001 is overdue. Review the secure payment options in your portal.",
  },
  "EPS-1005": {
    actionType: "CREATE_PAYMENT_LINK",
    channel: "EMAIL",
    policyResult: "ALLOW",
    title: "Low-friction payment link",
    message: "Epsilon Foods receives a payment-link recommendation because the expected recovery value is strong.",
  },
  "BET-1002": {
    actionType: "ESCALATE_TO_HUMAN",
    channel: "INTERNAL",
    policyResult: "REQUIRE_HUMAN_APPROVAL",
    title: "Human approval required",
    message: "Beta Industries exceeds the autonomous value threshold; no customer contact is sent until an operator approves.",
  },
  "ZET-1006": {
    actionType: "SEND_REMINDER",
    channel: "EMAIL",
    policyResult: "BLOCK",
    title: "Contact blocked by opt-out",
    message: "Zeta Pharma opted out of communications. The simulated notification is recorded as blocked and is never sent.",
  },
};

async function ensureDemoUser() {
  const password = await bcrypt.hash(DEMO_PASSWORD, 10);
  const isDefaultLocalDemo = DEMO_EMAIL === LOCAL_HACKATHON_DEMO.email;
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    // The reserved `.test` identity is intentionally refreshed so the
    // documented local judge credentials are always usable. Overrides remain
    // non-destructive to avoid clobbering a real staging operator.
    update: isDefaultLocalDemo ? { name: LOCAL_HACKATHON_DEMO.name, password } : {},
    create: {
      email: DEMO_EMAIL,
      name: isDefaultLocalDemo ? LOCAL_HACKATHON_DEMO.name : "Demo Merchant",
      password,
    },
  });
  return user;
}

/** Upsert an invoice on the (invoiceNumber, ownerUserId) unique key. */
async function upsertInvoice(
  userId: string,
  customerId: number,
  profile: Profile,
  fields: Prisma.InvoiceUncheckedCreateInput,
) {
  const shared = {
    ...fields,
    customer: profile.name,
    clientName: profile.name,
    clientEmail: profile.email,
    clientPhone: profile.phone,
    customerId,
    // The app writes both owner columns when it creates an invoice, so the seed
    // must too — some views scope on ownerUserId and others on userId.
    ownerUserId: userId,
    userId,
    currency: "INR",
  };
  return prisma.invoice.upsert({
    where: { invoiceNumber_ownerUserId: { invoiceNumber: fields.invoiceNumber!, ownerUserId: userId } },
    update: shared,
    create: shared,
  });
}

/** Payment has no natural unique key, so dedupe on a deterministic transactionId. */
async function ensurePayment(
  invoiceId: number,
  amount: number,
  date: Date,
  transactionId: string,
  method = "NEFT",
) {
  const existing = await prisma.payment.findFirst({ where: { transactionId } });
  if (existing) {
    await prisma.payment.update({
      where: { id: existing.id },
      data: { invoiceId, amount, date, method },
    });
    return;
  }
  await prisma.payment.create({ data: { invoiceId, amount, date, method, transactionId } });
}

/**
 * Keeps a recovered demo fixture subject to the same audit invariant as a real
 * provider callback: one Payment is linked to one immutable RecoverySettlement.
 *
 * Fresh fixtures reach this through `settleInvoicePayment`. This helper is also
 * an idempotent compatibility repair for fixtures created before the settlement
 * ledger existed, so rerunning `pnpm ai:seed` upgrades a local demo safely.
 */
async function ensureSeededRecoverySettlement(args: {
  invoiceId: number;
  recoveryCaseId: number;
  amount: number;
  paidAt: Date;
  transactionId: string;
}) {
  const { invoiceId, recoveryCaseId, amount, paidAt, transactionId } = args;

  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { transactionId },
      select: { id: true, invoiceId: true, amount: true },
    });
    if (!payment || payment.invoiceId !== invoiceId || Number(payment.amount) !== amount) {
      throw new Error(`Seeded recovery payment ${transactionId} does not match its invoice fixture`);
    }

    const existingSettlement = await tx.recoverySettlement.findUnique({
      where: { paymentId: payment.id },
      select: { recoveryCaseId: true, amount: true },
    });
    if (
      existingSettlement &&
      (existingSettlement.recoveryCaseId !== recoveryCaseId || Number(existingSettlement.amount) !== amount)
    ) {
      throw new Error(`Seeded recovery payment ${transactionId} is already settled against another case`);
    }

    if (!existingSettlement) {
      await tx.recoverySettlement.create({
        data: {
          recoveryCaseId,
          paymentId: payment.id,
          amount,
          // This fixture proves the ledger shape, not causal AI attribution.
          attribution: "SEEDED_DEMO",
        },
      });
    } else {
      // `settleInvoicePayment` creates a generic confirmed-recovery credit on
      // first seed. This known local fixture must remain visibly synthetic in
      // analytics and demo views rather than being mistaken for a live result.
      await tx.recoverySettlement.update({
        where: { paymentId: payment.id },
        data: {
          attribution: "SEEDED_DEMO",
          attributedAgentRunId: null,
          attributedAgentActionId: null,
        },
      });
    }

    const settled = await tx.recoverySettlement.aggregate({
      where: { recoveryCaseId },
      _sum: { amount: true },
    });
    const recoveredAmount = Number(settled._sum.amount ?? 0);
    if (Math.abs(recoveredAmount - amount) > 0.005) {
      throw new Error(`Seeded recovery case ${recoveryCaseId} has an unexpected settlement total`);
    }

    await tx.invoice.update({
      where: { id: invoiceId },
      data: { amountPaid: amount, balance: 0, status: "Paid" },
    });
    await tx.recoveryCase.update({
      where: { id: recoveryCaseId },
      data: {
        status: "PAID",
        stage: "RESOLVED",
        resolvedAt: paidAt,
        amountAtRisk: amount,
        recoveredAmount,
        expectedRecovery: amount,
      },
    });
  });
}

/** Historical paid invoices — these are what the risk model reads as behaviour. */
async function seedHistory(userId: string, customerId: number, profile: Profile) {
  const prefix = profile.name.slice(0, 3).toUpperCase();
  for (let h = 0; h < profile.history; h += 1) {
    const due = new Date(Date.now() - (30 + h * 45) * DAY);
    const number = `${prefix}-H-${h + 1}`;
    const invoice = await upsertInvoice(userId, customerId, profile, {
      invoiceNumber: number,
      amount: 10_000,
      subtotal: 10_000,
      total: 10_000,
      amountPaid: 10_000,
      balance: 0,
      status: "Paid",
      date: new Date(due.getTime() - 5 * DAY),
      dueDate: due,
    });

    // The first `late` invoices were paid after the due date; the rest early.
    const paidLate = h < profile.late;
    const paidAt = paidLate
      ? new Date(due.getTime() + (5 + h) * DAY)
      : new Date(due.getTime() - 2 * DAY);
    await ensurePayment(invoice.id, 10_000, paidAt, `seed-hist-${userId}-${number}`);
  }
}

async function seed() {
  const user = await ensureDemoUser();
  console.log(`Demo user: ${user.email}`);

  // ---------------------------------------------------------------- products
  for (const p of PRODUCTS) {
    const existing = await prisma.product.findFirst({
      where: { name: p.name, ownerUserId: user.id },
    });
    if (existing) {
      await prisma.product.update({ where: { id: existing.id }, data: { ...p, ownerUserId: user.id } });
    } else {
      await prisma.product.create({ data: { ...p, ownerUserId: user.id } });
    }
  }
  console.log(`Products: ${PRODUCTS.length}`);

  // --------------------------------------------------------------- customers
  const customerByName = new Map<string, number>();
  for (const profile of PROFILES) {
    // Matches the oldest invoice seedHistory() creates, so the risk model reads
    // a consistent customer age.
    const firstInvoiceAt = new Date(Date.now() - (35 + (profile.history - 1) * 45) * DAY);
    const shared = {
      email: profile.email,
      phone: profile.phone,
      city: profile.city,
      state: profile.state,
      country: "India",
      firstInvoiceAt,
      cibilScore: profile.cibil,
      isVipExempt: profile.vip ?? false,
      communicationOptOut: profile.optOut ?? false,
    };
    const customer = await prisma.customer.upsert({
      where: { name_ownerUserId: { name: profile.name, ownerUserId: user.id } },
      update: shared,
      create: { ...shared, name: profile.name, ownerUserId: user.id },
    });
    customerByName.set(profile.name, customer.id);
    await seedHistory(user.id, customer.id, profile);
  }
  console.log(`Customers: ${PROFILES.length} (with payment history)`);

  // ---------------------------------------------------------------- invoices
  const counts = { OVERDUE: 0, RECOVERED: 0, PARTIAL: 0, UPCOMING: 0 };
  let recoveredTotal = 0;
  let atRiskTotal = 0;

  for (const spec of INVOICES) {
    const profile = PROFILES.find((p) => p.name === spec.customer);
    if (!profile) throw new Error(`Unknown customer in INVOICES: ${spec.customer}`);
    const customerId = customerByName.get(spec.customer)!;

    const dueDate =
      spec.kind === "UPCOMING"
        ? new Date(Date.now() + (spec.daysUntilDue ?? 7) * DAY)
        : new Date(Date.now() - (spec.daysOverdue ?? 7) * DAY);

    const isRecovered = spec.kind === "RECOVERED";
    // New fixtures use a merchant-scoped id. The legacy id lets a repeat seed
    // repair the local demo data produced before this script was ledger-backed.
    const recoveryTransactionId = `seed-recovered-${user.id}-${spec.number}`;
    const legacyRecoveryTransactionId = `seed-recovered-${spec.number}`;
    const existingInvoice = isRecovered
      ? await prisma.invoice.findUnique({
          where: {
            invoiceNumber_ownerUserId: { invoiceNumber: spec.number, ownerUserId: user.id },
          },
          select: { id: true },
        })
      : null;
    const existingRecoveryPayment = existingInvoice
      ? await prisma.payment.findFirst({
          where: {
            invoiceId: existingInvoice.id,
            transactionId: { in: [recoveryTransactionId, legacyRecoveryTransactionId] },
          },
          select: { transactionId: true },
        })
      : null;
    const paidSoFar = isRecovered
      ? existingRecoveryPayment
        ? spec.amount
        : 0
      : spec.kind === "PARTIAL"
        ? spec.paidSoFar ?? 0
        : 0;
    const balance = spec.amount - paidSoFar;

    const invoice = await upsertInvoice(user.id, customerId, profile, {
      invoiceNumber: spec.number,
      amount: spec.amount,
      subtotal: spec.amount,
      total: spec.amount,
      amountPaid: paidSoFar,
      balance,
      // The sweep picks up Pending/Draft with a past due date and balance > 0.
      status: isRecovered && existingRecoveryPayment ? "Paid" : "Pending",
      date: new Date(dueDate.getTime() - 7 * DAY),
      dueDate,
      autoReminderEnabled: true,
      reminderOffsets: [7, 3, 1, 0],
      overdueReminderEnabled: true,
      overdueReminderEveryDays: 3,
      reminderChannel: "EMAIL",
      note: spec.demonstrates,
    });

    if (spec.kind === "PARTIAL") {
      const paidAt = new Date(Date.now() - 3 * DAY);
      await ensurePayment(invoice.id, paidSoFar, paidAt, `seed-partial-${spec.number}`, "UPI");
    }

    // A RecoveryCase exists for everything the agent has touched or will touch.
    // Upcoming invoices get none — they are outside the sweep's scope.
    if (spec.kind !== "UPCOMING") {
      const caseRow = await prisma.recoveryCase.upsert({
        where: { invoiceId: invoice.id },
        update: isRecovered
          ? {
              // The payment service (or the compatibility repair below) owns
              // the final paid state and recovered amount.
              status: "OPEN",
              stage: "SCORING",
              resolvedAt: null,
              amountAtRisk: spec.amount,
              recoveredAmount: 0,
              expectedRecovery: spec.amount,
            }
          : {
              status: "OPEN",
              stage: "SCORING",
              amountAtRisk: balance,
              recoveredAmount: 0,
              resolvedAt: null,
            },
        create: {
          invoiceId: invoice.id,
          ownerUserId: user.id,
          status: "OPEN",
          stage: "SCORING",
          resolvedAt: null,
          amountAtRisk: isRecovered ? spec.amount : balance,
          recoveredAmount: 0,
          expectedRecovery: isRecovered ? spec.amount : 0,
        },
      });

      if (isRecovered) {
        const paidAt = new Date(Date.now() - (spec.recoveredDaysAgo ?? 1) * DAY);
        const transactionId = existingRecoveryPayment?.transactionId ?? recoveryTransactionId;

        if (!existingRecoveryPayment) {
          // Fresh fixtures use the exact production settlement path: payment →
          // immutable recovery settlement → paid invoice/case, atomically.
          await settleInvoicePayment({
            invoiceId: invoice.id,
            ownerUserId: user.id,
            amount: spec.amount,
            date: paidAt,
            method: "Seeded Razorpay recovery fixture",
            note: "Illustrative local demo payment; not a provider callback.",
            transactionId,
          });
        }

        // Backfill older local fixtures and assert the fresh service path left
        // the same immutable ledger trail.
        await ensureSeededRecoverySettlement({
          invoiceId: invoice.id,
          recoveryCaseId: caseRow.id,
          amount: spec.amount,
          paidAt,
          transactionId,
        });
        recoveredTotal += spec.amount;

        // Minimal pre-baked trail so the case detail view is not blank. Every
        // row is explicitly synthetic and excluded from adaptive learning.
        const trail =
          spec.number === "GAM-1011"
            ? [{ actionType: "CREATE_PAYMENT_LINK", channel: "RAZORPAY" }]
            : [{ actionType: "SEND_REMINDER", channel: "EMAIL" }];
        await prisma.agentAction.deleteMany({
          where: { recoveryCaseId: caseRow.id, reason: { startsWith: `seed-trail-${spec.number}-` } },
        });
        for (const [i, step] of trail.entries()) {
          const marker = `seed-trail-${spec.number}-${i}`;
          await prisma.agentAction.create({
            data: {
              recoveryCaseId: caseRow.id,
              invoiceId: invoice.id,
              actionType: step.actionType,
              channel: step.channel,
              riskScore: 0.35,
              policyResult: "ALLOW",
              policyReasons: ["Seeded demo history"],
              approvalRequired: false,
              status: "EXECUTED",
              executionStatus: "SUCCESS",
              fallbackUsed: false,
              reason: `${marker}: illustrative historical recovery; excluded from learning`,
              payload: { seeded: true, seedMarker: marker, source: "local-demo" },
              createdAt: new Date(Date.now() - ((spec.recoveredDaysAgo ?? 1) + 2 - i) * DAY),
              completedAt: new Date(Date.now() - ((spec.recoveredDaysAgo ?? 1) + 2 - i) * DAY),
            },
          });
        }
      } else {
        atRiskTotal += balance;

        const preview = NOTIFICATION_PREVIEWS[spec.number];
        if (preview) {
          const marker = `seed-notification-${spec.number}`;
          await prisma.agentAction.deleteMany({
            where: { recoveryCaseId: caseRow.id, reason: { startsWith: marker } },
          });
          await prisma.agentAction.create({
            data: {
              recoveryCaseId: caseRow.id,
              invoiceId: invoice.id,
              actionType: preview.actionType,
              channel: preview.channel,
              riskScore: Number(caseRow.riskScore),
              policyResult: preview.policyResult,
              policyReasons: ["Seeded local hackathon notification preview"],
              approvalRequired: preview.policyResult === "REQUIRE_HUMAN_APPROVAL",
              status: preview.policyResult === "BLOCK" ? "BLOCKED" : "SIMULATED",
              executionStatus: preview.policyResult === "BLOCK" ? "BLOCKED" : "SIMULATED",
              provider: "simulation",
              reason: `${marker}: ${preview.title}`,
              payload: {
                seeded: true,
                dryRun: true,
                source: "local-hackathon-demo",
                notification: {
                  title: preview.title,
                  channel: preview.channel,
                  message: preview.message,
                  sent: false,
                  blocked: preview.policyResult === "BLOCK",
                },
              },
              completedAt: new Date(),
            },
          });
        }
      }
    }

    counts[spec.kind] += 1;
  }

  // ------------------------------------------------------------------- prune
  if (PRUNE) {
    const expected = new Set<string>(INVOICES.map((s) => s.number));
    for (const profile of PROFILES) {
      const prefix = profile.name.slice(0, 3).toUpperCase();
      for (let h = 0; h < profile.history; h += 1) expected.add(`${prefix}-H-${h + 1}`);
    }
    const stale = await prisma.invoice.findMany({
      where: { ownerUserId: user.id, invoiceNumber: { notIn: [...expected] } },
      select: { id: true, invoiceNumber: true, balance: true },
    });
    if (stale.length) {
      // Invoice children (items, payments, reminder logs, recovery cases and
      // their actions, payment events) all cascade, so one delete is enough.
      await prisma.invoice.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
      console.log(`\nPruned ${stale.length} invoice(s) no longer defined by this seed:`);
      for (const s of stale) console.log(`  ${s.invoiceNumber} (balance ₹${s.balance})`);
    } else {
      console.log(`\nNothing to prune.`);
    }
  }

  // ----------------------------------------------------------------- summary
  console.log(`\nInvoices seeded (plus paid history per customer):`);
  console.log(`  overdue, open cases : ${counts.OVERDUE}`);
  console.log(`  already recovered   : ${counts.RECOVERED}`);
  console.log(`  part paid           : ${counts.PARTIAL}`);
  console.log(`  not yet due         : ${counts.UPCOMING}`);
  console.log(`\nDashboard should show:`);
  console.log(`  Recovered : ₹${recoveredTotal.toLocaleString("en-IN")}`);
  console.log(`  At risk   : ₹${atRiskTotal.toLocaleString("en-IN")}`);
  console.log(`\nPolicy paths this dataset exercises:`);
  for (const spec of INVOICES.filter((s) => s.kind === "OVERDUE")) {
    console.log(`  ${spec.number.padEnd(9)} ₹${String(spec.amount).padStart(7)}  ${spec.demonstrates}`);
  }
  console.log(`\nNext: open /dashboard/recovery and click "Run Safe Demo".`);
  if (DEMO_EMAIL === LOCAL_HACKATHON_DEMO.email) {
    console.log(`Local login: ${LOCAL_HACKATHON_DEMO.id} / ${LOCAL_HACKATHON_DEMO.password}`);
  } else {
    console.log(`Local login email: ${DEMO_EMAIL}`);
  }
}

seed()
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

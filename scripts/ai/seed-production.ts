#!/usr/bin/env node
/**
 * Explicitly opt-in staging seed script for the AI Revenue Recovery demo.
 *
 * This script is IDEMPOTENT — running it multiple times does not create
 * duplicates. It only creates data if the demo user has no recovery cases.
 *
 * Usage:
 *   ALLOW_STAGING_DEMO_SEED=true npx tsx scripts/ai/seed-production.ts
 *
 * Environment:
 *   DATABASE_URL must point to a disposable staging database.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL || "demo@invo-notify.test";
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || "RazorpayDemo2026";

const PROFILES = [
  { name: "Acme Traders", email: "acme@demo.test", amount: 24500, daysOverdue: 7, cibil: 720 },
  { name: "Beta Industries", email: "beta@demo.test", amount: 124000, daysOverdue: 21, cibil: 580 },
  { name: "Gamma Retail", email: "gamma@demo.test", amount: 12000, daysOverdue: 3, cibil: 810 },
  { name: "Delta Logistics", email: "delta@demo.test", amount: 82000, daysOverdue: 35, cibil: 620 },
  { name: "Epsilon Foods", email: "epsilon@demo.test", amount: 39000, daysOverdue: 12, cibil: 700 },
];

async function main() {
  if (process.env.ALLOW_STAGING_DEMO_SEED !== "true") {
    throw new Error(
      "Refusing to seed a non-local database. Use pnpm ai:seed for the local demo, " +
        "or set ALLOW_STAGING_DEMO_SEED=true only for a disposable staging database.",
    );
  }

  console.log("Staging demo seed — checking if data already exists…\n");

  // Check if demo user already has recovery cases
  const existingUser = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    select: {
      id: true,
      _count: {
        select: {
          invoices: true,
        },
      },
    },
  });

  if (existingUser && existingUser._count.invoices > 0) {
    console.log(`Demo user ${DEMO_EMAIL} already has ${existingUser._count.invoices} invoices.`);
    console.log("Skipping seed — data already exists.");
    await prisma.$disconnect();
    return;
  }

  // Create or reuse demo user
  let userId: string;
  if (existingUser) {
    userId = existingUser.id;
    console.log(`Reusing existing demo user: ${DEMO_EMAIL}`);
  } else {
    const password = await bcrypt.hash(DEMO_PASSWORD, 10);
    const user = await prisma.user.create({
      data: {
        email: DEMO_EMAIL,
        name: "Demo Merchant",
        password,
      },
    });
    userId = user.id;
    console.log(`Created demo user: ${DEMO_EMAIL}`);
  }

  let invoicesCreated = 0;

  for (const profile of PROFILES) {
    // Upsert customer
    const customer = await prisma.customer.upsert({
      where: {
        name_ownerUserId: { name: profile.name, ownerUserId: userId },
      },
      update: {},
      create: {
        name: profile.name,
        email: profile.email,
        ownerUserId: userId,
        cibilScore: profile.cibil,
      },
    });

    // Create overdue invoice
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() - profile.daysOverdue);

    const invoiceNumber = `DEMO-${profile.name.slice(0, 3).toUpperCase()}-${Date.now()}`;

    const invoice = await prisma.invoice.create({
      data: {
        customer: customer.name,
        clientName: customer.name,
        clientEmail: customer.email || profile.email,
        clientPhone: "+919000000000",
        customerId: customer.id,
        ownerUserId: userId,
        invoiceNumber,
        amount: profile.amount,
        subtotal: profile.amount,
        total: profile.amount,
        amountPaid: 0,
        balance: profile.amount,
        status: "Pending",
        currency: "INR",
        date: new Date(dueDate.getTime() - 7 * 86400000),
        dueDate,
        autoReminderEnabled: true,
        reminderOffsets: [7, 3, 1, 0],
        overdueReminderEnabled: true,
        overdueReminderEveryDays: 3,
        reminderChannel: "EMAIL",
      },
    });

    // Create open recovery case
    await prisma.recoveryCase.create({
      data: {
        invoiceId: invoice.id,
        ownerUserId: userId,
        status: "OPEN",
        stage: "SCORING",
      },
    });

    invoicesCreated += 1;
    console.log(`  ✓ ${invoiceNumber} — ₹${profile.amount.toLocaleString("en-IN")} (${profile.daysOverdue}d overdue)`);
  }

  console.log(`\nSeeded ${invoicesCreated} demo invoices with open recovery cases.`);
  console.log(`Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`Dashboard: /dashboard/recovery`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Deterministic Module A/I proof: pushes a diverse 500-event portfolio through
 * the exact ingestion path used by the public v1 API. It never executes a
 * provider action; the optional sweep remains a separately invoked dry-run.
 */
import { prisma } from "@/lib/db";
import { ingestRevenueEvent, type RevenueEventInput } from "@/lib/revenue-events";

const EVENT_COUNT = Math.max(500, Number(process.env.HACKATHON_BATCH_SIZE || 500));
const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL || "razorpay@invo-notify.test";
const EVENT_TYPES = ["PAYMENT_FAILED", "CHECKOUT_ABANDONED", "SUBSCRIPTION_FAILED", "INVOICE_OVERDUE"] as const;
const FAILURE_CODES = ["INSUFFICIENT_FUNDS", "ISSUER_UNAVAILABLE", "NETWORK_TIMEOUT", "CARD_EXPIRED", "MANDATE_REVOKED"] as const;

function eventAt(index: number): RevenueEventInput {
  const eventType = EVENT_TYPES[index % EVENT_TYPES.length];
  const customerId = `hackathon-customer-${String(index % 125).padStart(3, "0")}`;
  const amount = 1_000 + ((index * 7_913) % 180_000);
  const occurredAt = new Date(Date.UTC(2026, 7, 1 + (index % 28), 9, index % 60));
  const failureCode = eventType === "CHECKOUT_ABANDONED"
    ? "CUSTOMER_ABANDONED"
    : eventType === "INVOICE_OVERDUE"
      ? "INVOICE_OVERDUE"
      : FAILURE_CODES[index % FAILURE_CODES.length];
  return {
    source: "hackathon-simulator",
    sourceEventId: `razorpay-recovery-batch-v1-${String(index).padStart(4, "0")}`,
    eventType,
    customerId,
    amount,
    currency: "INR",
    occurredAt,
    failureCode,
    failureReason: "Deterministic local hackathon fixture",
    payload: {
      customerName: `Hackathon Merchant ${String(index % 125).padStart(3, "0")}`,
      customerEmail: `merchant-${String(index % 125).padStart(3, "0")}@example.test`,
      synthetic: true,
      batch: "razorpay-recovery-v1",
      eventOrdinal: index,
    },
  };
}

async function main() {
  const merchant = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } });
  if (!merchant) throw new Error(`Demo user ${DEMO_EMAIL} is missing — run pnpm ai:seed first.`);
  const run = await prisma.batchRun.create({
    data: { merchantId: merchant.id, trigger: "HACKATHON_SIMULATION", status: "RUNNING", totalEvents: EVENT_COUNT },
  });
  const counts = { accepted: 0, duplicate: 0, quarantined: 0, casesCreated: 0, casesUpdated: 0 };
  try {
    for (let index = 0; index < EVENT_COUNT; index += 1) {
      const result = await ingestRevenueEvent(merchant.id, eventAt(index));
      if (result.status === "accepted") {
        counts.accepted += 1;
        if (result.caseDisposition === "created") counts.casesCreated += 1;
        else counts.casesUpdated += 1;
      } else if (result.status === "duplicate") counts.duplicate += 1;
      else counts.quarantined += 1;
    }
    await prisma.batchRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        acceptedEvents: counts.accepted,
        rejectedEvents: counts.quarantined,
        duplicateEvents: counts.duplicate,
        casesCreated: counts.casesCreated,
        casesUpdated: counts.casesUpdated,
        completedAt: new Date(),
        summary: { ...counts, eventTypes: EVENT_TYPES, simulated: true, sideEffects: "none" },
      },
    });
    console.log(JSON.stringify({ batchRunId: run.id, totalEvents: EVENT_COUNT, ...counts, simulated: true }, null, 2));
  } catch (error) {
    await prisma.batchRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), error: error instanceof Error ? error.message : String(error) } });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Hackathon batch failed:", error);
  process.exit(1);
});

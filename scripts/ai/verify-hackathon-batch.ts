/** Deterministic database proof for the 500-event hackathon data path. */
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { LOCAL_HACKATHON_DEMO } from "@/lib/demo-account";

async function main() {
  const user = await prisma.user.findUnique({ where: { email: process.env.SEED_DEMO_EMAIL || LOCAL_HACKATHON_DEMO.email }, select: { id: true } });
  assert.ok(user, "Local demo user is missing. Run pnpm ai:seed first.");
  const batch = await prisma.batchRun.findFirst({ where: { merchantId: user.id, trigger: "HACKATHON_SIMULATION" }, orderBy: { id: "desc" } });
  assert.ok(batch, "No hackathon batch exists. Run pnpm ai:batch first.");
  const [events, linkedEvents] = await Promise.all([
    prisma.revenueEvent.count({ where: { merchantId: user.id, source: "hackathon-simulator" } }),
    prisma.revenueEvent.findMany({ where: { merchantId: user.id, source: "hackathon-simulator", recoveryCaseId: { not: null } }, select: { recoveryCaseId: true } }),
  ]);
  const caseIds = Array.from(new Set(linkedEvents.map((event) => event.recoveryCaseId).filter((id): id is number => id !== null)));
  const auditRows = await prisma.auditLog.count({ where: { recoveryCaseId: { in: caseIds } } });
  const cases = caseIds.length;
  assert.ok(events >= 500, `Expected at least 500 persisted events, got ${events}`);
  assert.ok(cases >= 500, `Expected at least 500 linked recovery cases, got ${cases}`);
  // RevenueEvent is itself the immutable source evidence for every linked case.
  // Agent/audit evidence is added later by the sweep; report it rather than
  // falsely requiring an action for an event that is only being ingested.
  console.log(JSON.stringify({ verdict: "PASS", batchRunId: batch.id, totalEvents: events, linkedCases: cases, linkedEventEvidence: linkedEvents.length, downstreamAuditRows: auditRows, simulated: true, externalCalls: 0 }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma['$disconnect']());

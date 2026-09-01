/**
 * Failure simulation for the AI recovery agent (Phase 10 / QA).
 *
 * Exercises the graceful-degradation story used in the demo:
 *   1. Runs the recovery sweep with simulated provider failures enabled.
 *   2. Prints a per-invoice breakdown showing which actions failed and why.
 *
 * NOTE: This script performs a real sweep against the database. Simulated
 * failures only affect SEND_REMINDER actions in the sweep run.
 *
 * Run with:
 *   pnpm qa:simulate-failures
 */
import { prisma } from "../../lib/db";
import { runRecoverySweep } from "../../lib/ai/orchestrator";

async function main() {
  const userId = process.env.QA_USER_ID;
  if (!userId) {
    console.error("Set QA_USER_ID to the demo user id before running.");
    process.exit(1);
  }

  console.log("Starting failure-simulation sweep…\n");
  const result = await runRecoverySweep({
    userId,
    trigger: "MANUAL",
    simulateFailures: true,
  });

  console.log(`Run #${result.runId}`);
  console.log(`Invoices scanned : ${result.totalInvoices}`);
  console.log(`Processed        : ${result.processed}`);
  console.log(`Actions issued   : ${result.actions}`);
  console.log(`Expected recovery: ₹${result.expectedRecoveryAmount.toLocaleString("en-IN")}`);
  console.log(`Confirmed recovered: ₹${result.recoveredAmount.toLocaleString("en-IN")}`);
  console.log("");

  for (const row of result.invoiceResults) {
    const icon =
      row.actionStatus === "FAILED"
        ? "✗"
        : row.actionStatus === "EXECUTED" || row.actionStatus === "SCHEDULED"
          ? "✓"
          : "·";
    console.log(
      `${icon} ${row.invoiceNumber.padEnd(14)} risk=${Math.round(row.riskScore * 100)}%  ` +
        `${row.recommendedAction.padEnd(20)} policy=${row.policyDecision.padEnd(24)} ` +
        `action=${row.actionStatus ?? "none"}` +
        (row.error ? `  → ${row.error}` : ""),
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Simulation failed:", err);
  process.exit(1);
});

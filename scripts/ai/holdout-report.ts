#!/usr/bin/env node
/**
 * Holdout comparison report — measured, not simulated.
 * ====================================================
 * Compares the recovery agent's treatment arm against the permanent control
 * arm using confirmed settlements (`RecoverySettlement`, unique by paymentId).
 *
 * The control arm is scored and audited exactly like the treatment arm but is
 * never contacted, so the delta here is the incremental effect of the agent.
 * It is not an outcome model and it is not a forecast.
 *
 * Run:   pnpm ai:holdout
 *        pnpm ai:holdout --merchant <ownerUserId>
 *
 * Writes: docs/holdout-report.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getHoldoutReport, MIN_CASES_PER_ARM } from "../../lib/ai/holdout";

function rupees(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function percent(value: number, digits = 2): string {
  return `${(value * 100).toFixed(digits)}%`;
}

async function main() {
  const args = process.argv.slice(2);
  const merchantIndex = args.indexOf("--merchant");
  const merchant = merchantIndex >= 0 ? args[merchantIndex + 1] : undefined;

  const report = await getHoldoutReport(merchant);
  const { TREAT: treat, HOLD: hold } = report.arms;

  console.log("");
  console.log("  RECOVERY HOLDOUT — MEASURED ON CONFIRMED SETTLEMENTS");
  console.log("  ───────────────────────────────────────────────────");
  console.log(`  scope            ${report.scope.ownerUserId ?? "all merchants"}`);
  console.log(`  assignment       ${report.assignment.version}, ${percent(report.assignment.rate, 0)} held from automation`);
  console.log(`  measured cases   ${report.provenance.measuredCases}`);
  console.log(`  excluded         ${report.provenance.excludedSeededDemoCases} seeded demo, ${report.provenance.excludedUnassignedCases} unassigned legacy`);
  console.log("");
  console.log("  arm      cases   at risk        recovered      recovered share   case win rate");
  for (const arm of [treat, hold]) {
    console.log(
      "  " +
        arm.arm.padEnd(8) +
        String(arm.cases).padEnd(8) +
        rupees(arm.amountAtRisk).padEnd(15) +
        rupees(arm.recoveredAmount).padEnd(15) +
        percent(arm.recoveredShareOfAtRisk).padEnd(18) +
        percent(arm.settledCaseRate),
    );
    console.log(
      `           mean case recovery ${percent(arm.meanCaseRecoveryFraction)} ` +
        `(95% CI ${percent(arm.ci95[0], 1)} to ${percent(arm.ci95[1], 1)})`,
    );
  }
  console.log("");
  console.log(`  effect           ${report.effect.verdict}`);
  console.log(`  delta            ${report.effect.absoluteDelta >= 0 ? "+" : ""}${(report.effect.absoluteDelta * 100).toFixed(2)} pts` +
    ` (95% CI ${(report.effect.ci95[0] * 100).toFixed(2)} to ${(report.effect.ci95[1] * 100).toFixed(2)})` +
    (report.effect.relativeDelta === null ? "" : `, relative ${percent(report.effect.relativeDelta)}`));
  console.log(`  min sample       ${MIN_CASES_PER_ARM} cases per arm`);
  console.log("");
  console.log(`  ${report.effect.interpretation}`);
  console.log(`  ${report.provenance.note}`);
  console.log("");

  const outPath = path.join(process.cwd(), "docs", "holdout-report.json");
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`  wrote ${path.relative(process.cwd(), outPath)}`);
  console.log("");
}

main().catch((error) => {
  console.error("Holdout report failed:", error);
  process.exit(1);
});

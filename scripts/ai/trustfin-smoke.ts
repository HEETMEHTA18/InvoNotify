#!/usr/bin/env node
/**
 * TrustFin verifier smoke test.
 *
 * Checks the configured deployment end to end from the app's point of view:
 * health, the feature contract, and one assessment. Prints the exact response
 * so a 422 feature-mapping mismatch is visible instead of silent.
 *
 * Run:  pnpm trustfin:smoke
 */
import { getTrustFinConfig } from "../../lib/ai/config";

async function main() {
  const config = getTrustFinConfig();
  if (!config.url) {
    console.log("");
    console.log("  TrustFin verifier is not configured (TRUSTFIN_RISK_URL is unset).");
    console.log("  The recovery pipeline runs exactly as before — the gate is a no-op.");
    console.log("");
    return;
  }

  const base = config.url.replace(/\/+$/, "");
  console.log("");
  console.log(`  endpoint   ${base}`);
  console.log(`  threshold  ${config.threshold}`);
  console.log(`  required   ${config.required}`);

  const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(config.timeoutMs) });
  const healthBody = await health.text();
  console.log(`  health     ${health.status} ${healthBody.slice(0, 400)}`);
  if (!health.ok) {
    console.log("\n  Verifier is reachable but unhealthy — check the model artefact path.");
    process.exitCode = 1;
    return;
  }

  const response = await fetch(`${base}/v1/assess`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      threshold: config.threshold,
      features: {
        amountClaims: 1,
        ungroundedClaims: 0,
        groundingRate: 1,
        evidenceTokenOverlap: 0.25,
        reasonTokens: 8,
        programSteps: 0,
        hasExecutableProgram: 0,
        promptLength: 96,
        truncated: 0,
      },
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  const body = await response.text();
  console.log(`  assess     ${response.status} ${body.slice(0, 600)}`);

  if (response.status === 422) {
    console.log("");
    console.log("  422 = feature contract mismatch. Set TRUSTFIN_FEATURE_MAP on the");
    console.log("  service so the model's feature names map to the names above.");
    process.exitCode = 1;
    return;
  }
  if (!response.ok) {
    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("  OK — a risk at or above the threshold, or abstain, will now route");
  console.log("  the affected action to human review. It can never unlock a BLOCK.");
  console.log("");
}

main().catch((error) => {
  console.error("TrustFin smoke test failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

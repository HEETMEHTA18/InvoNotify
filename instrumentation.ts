/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Registers the AI recovery event workflows so Razorpay webhook events
 * (payment_link.paid / expired / payment.failed) automatically drive the
 * recovery loop without any manual trigger.
 */
export async function register() {
  // The guard MUST be a positive `if` wrapping the import, not an early
  // `if (... !== "nodejs") return`. Next compiles this file for the edge
  // runtime as well, and webpack only drops the *untaken branch* of a
  // condition — it cannot tell that an early `return` makes the code after it
  // unreachable. With the early-return form the edge bundle still pulled in
  // the orchestrator -> mail-service -> googleapis chain and failed to resolve
  // node builtins (`http`, `worker_threads`), which broke every route.
  // NEXT_RUNTIME is substituted at build time, so this whole block is
  // eliminated from the edge compilation.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { initRecoveryWorkflows } = await import("./lib/events/workflows/recovery");
      initRecoveryWorkflows();
      console.log("[instrumentation] AI recovery event workflows registered");
    } catch (error) {
      console.error("[instrumentation] Failed to register recovery workflows:", error);
    }
  }
}

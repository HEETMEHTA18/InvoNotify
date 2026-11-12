import { NextResponse } from "next/server";
import { getHoldoutReport } from "@/lib/ai/holdout";
import { requireUser } from "@/lib/security/authz";

/**
 * Measured AI-versus-control recovery for the signed-in merchant.
 *
 * The withheld arm is a real cohort, not a simulation: it is scored and audited
 * like every other case but never contacted, so the reported delta is the
 * incremental effect on confirmed settlements. Returns an explicit
 * INSUFFICIENT_SAMPLE verdict rather than a small-sample claim.
 */
export async function GET() {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;

    const report = await getHoldoutReport(who.userId);
    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Holdout report error:", error);
    return NextResponse.json(
      { error: "Failed to build the holdout report" },
      { status: 500 },
    );
  }
}

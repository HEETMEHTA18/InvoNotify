import { NextRequest, NextResponse } from "next/server";
import { getRecoveryAnalytics, parseAnalyticsDays } from "@/lib/recovery-analytics";
import { requireUser } from "@/lib/security/authz";

/**
 * Intervention effectiveness. Recovered money is only assigned when the
 * immutable settlement was linked to the action at settlement time; it is never
 * inferred from a RecoveryCase cached total.
 */
export async function GET(request: NextRequest) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;

    const days = parseAnalyticsDays(new URL(request.url).searchParams.get("days"));
    const analytics = await getRecoveryAnalytics(who.userId, days);
    return NextResponse.json(
      {
        period: analytics.period,
        interventions: analytics.interventions,
        provenance: analytics.provenance,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Analytics interventions error:", error);
    return NextResponse.json({ error: "Failed to fetch intervention analytics" }, { status: 500 });
  }
}

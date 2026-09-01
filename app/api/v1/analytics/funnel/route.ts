import { NextRequest, NextResponse } from "next/server";
import { getRecoveryAnalytics, parseAnalyticsDays } from "@/lib/recovery-analytics";
import { requireUser } from "@/lib/security/authz";

/** PII-free funnel plus tenant-scoped recovery-case ID drilldowns. */
export async function GET(request: NextRequest) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;

    const days = parseAnalyticsDays(new URL(request.url).searchParams.get("days"));
    const analytics = await getRecoveryAnalytics(who.userId, days);
    return NextResponse.json(
      {
        period: analytics.period,
        funnel: analytics.funnel,
        drilldowns: analytics.funnelDrilldowns,
        provenance: analytics.provenance,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Analytics funnel error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics funnel" }, { status: 500 });
  }
}

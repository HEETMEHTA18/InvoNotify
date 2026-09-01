import { NextRequest, NextResponse } from "next/server";
import { getRecoveryAnalytics, parseAnalyticsDays } from "@/lib/recovery-analytics";
import { requireUser } from "@/lib/security/authz";

export async function GET(request: NextRequest) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;

    const days = parseAnalyticsDays(new URL(request.url).searchParams.get("days"));
    const analytics = await getRecoveryAnalytics(who.userId, days);

    return NextResponse.json({
      period: analytics.period,
      summary: analytics.summary,
      funnel: analytics.funnel,
      byCategory: analytics.byCategory,
      byAction: analytics.byAction,
      recentRuns: analytics.recentRuns,
      provenance: analytics.provenance,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Analytics overview error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics overview" },
      { status: 500 },
    );
  }
}

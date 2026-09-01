import { NextRequest, NextResponse } from "next/server";
import { getRecoveryAnalytics, parseAnalyticsDays } from "@/lib/recovery-analytics";
import { requireUser } from "@/lib/security/authz";

/** Root-cause aggregates intentionally omit diagnosis evidence and customer PII. */
export async function GET(request: NextRequest) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;

    const days = parseAnalyticsDays(new URL(request.url).searchParams.get("days"));
    const analytics = await getRecoveryAnalytics(who.userId, days);
    return NextResponse.json(
      {
        period: analytics.period,
        rootCauses: analytics.rootCauses,
        provenance: analytics.provenance,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Analytics root-causes error:", error);
    return NextResponse.json({ error: "Failed to fetch root-cause analytics" }, { status: 500 });
  }
}

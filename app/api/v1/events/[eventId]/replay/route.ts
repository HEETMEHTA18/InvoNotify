import { NextRequest, NextResponse } from "next/server";
import { replayRevenueEvent, RevenueEventValidationError } from "@/lib/revenue-events";
import { rateLimitResponse } from "@/lib/ai/rate-limit";
import { badRequest, notFound, parseId, requireUser } from "@/lib/security/authz";
import { crossOriginBlocked, isCrossOriginStateChange } from "@/lib/security/http";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;
    if (isCrossOriginStateChange(request)) return crossOriginBlocked();

    const limit = rateLimitResponse("revenue:ingest", who.userId);
    if (!limit.ok) return NextResponse.json(limit.body, { status: limit.status });

    const { eventId: rawEventId } = await params;
    const eventId = parseId(rawEventId);
    if (!eventId) return badRequest("Event ID must be a positive integer");

    const result = await replayRevenueEvent(who.userId, eventId);
    if (!result) return notFound("Event");

    return NextResponse.json({
      message:
        result.status === "accepted"
          ? "Event replayed and linked to a recovery case"
          : result.status === "quarantined"
            ? "Event replayed and remains quarantined"
            : "Event was already processed",
      result,
    });
  } catch (error) {
    if (error instanceof RevenueEventValidationError) {
      return badRequest(error.message, { code: error.code });
    }
    console.error("Revenue event replay error:", error);
    return NextResponse.json(
      { error: "Failed to replay revenue event" },
      { status: 500 },
    );
  }
}

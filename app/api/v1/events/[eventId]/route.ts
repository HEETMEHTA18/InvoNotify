import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, notFound, parseId, requireUser } from "@/lib/security/authz";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;

    const { eventId: rawEventId } = await params;
    const eventId = parseId(rawEventId);
    if (!eventId) return badRequest("Event ID must be a positive integer");

    const event = await prisma.revenueEvent.findFirst({
      where: { id: eventId, merchantId: who.userId },
      include: { payload: true, errors: true, recoveryCase: true },
    });
    if (!event) return notFound("Event");

    return NextResponse.json(event);
  } catch (error) {
    console.error("Revenue event fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch revenue event" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@/lib/db";
import {
  ingestRevenueEvent,
  RevenueEventConflictError,
  RevenueEventValidationError,
  revenueEventInputSchema,
} from "@/lib/revenue-events";
import {
  badRequest,
  parsePagination,
  requireUser,
} from "@/lib/security/authz";
import {
  crossOriginBlocked,
  isCrossOriginStateChange,
  readJson,
} from "@/lib/security/http";
import { rateLimitResponse } from "@/lib/ai/rate-limit";
import { z } from "zod";

export async function POST(request: NextRequest) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;
    if (isCrossOriginStateChange(request)) return crossOriginBlocked();

    const limit = rateLimitResponse("revenue:ingest", who.userId);
    if (!limit.ok) return NextResponse.json(limit.body, { status: limit.status });

    const body = await readJson<unknown>(request);
    if (!body.ok) return body.response;
    const validated = revenueEventInputSchema.parse(body.data);
    const result = await ingestRevenueEvent(who.userId, validated);

    if (result.status === "duplicate") {
      return NextResponse.json(
        {
          status: "DUPLICATE",
          eventId: result.eventId,
          recoveryCaseId: result.recoveryCaseId,
          message: "Event already persisted",
        },
        { status: 200 },
      );
    }

    if (result.status === "quarantined") {
      return NextResponse.json(
        {
          status: "QUARANTINED",
          eventId: result.eventId,
          code: result.code,
          message: result.message,
        },
        { status: 202 },
      );
    }

    return NextResponse.json(
      {
        status: "ACCEPTED",
        eventId: result.eventId,
        recoveryCaseId: result.recoveryCaseId,
        caseDisposition: result.caseDisposition,
        message: "Revenue event persisted and linked to a recovery case",
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    if (error instanceof RevenueEventValidationError) {
      return badRequest(error.message, { code: error.code });
    }
    if (error instanceof RevenueEventConflictError) {
      return NextResponse.json(
        { error: "Event identifier could not be accepted" },
        { status: 409 },
      );
    }
    console.error("Revenue event ingestion error:", error);
    return NextResponse.json(
      { error: "Failed to process revenue event" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;

    const { searchParams } = new URL(request.url);
    if (searchParams.has("merchantId")) {
      return badRequest("merchantId is inferred from the authenticated account");
    }

    const status = searchParams.get("status")?.trim();
    const eventType = searchParams.get("eventType")?.trim();
    if ((status && status.length > 120) || (eventType && eventType.length > 120)) {
      return badRequest("Event filter is too long");
    }

    const pagination = parsePagination(searchParams, { defaultSize: 50, maxSize: 200 });
    const rawOffset = searchParams.get("offset");
    const parsedOffset = rawOffset === null ? null : Number(rawOffset);
    const offset =
      parsedOffset !== null && Number.isSafeInteger(parsedOffset) && parsedOffset >= 0
        ? parsedOffset
        : pagination.skip;

    const where: Prisma.RevenueEventWhereInput = {
      merchantId: who.userId,
      ...(status ? { status } : {}),
      ...(eventType ? { eventType } : {}),
    };
    const [events, total] = await Promise.all([
      prisma.revenueEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: pagination.pageSize,
        skip: offset,
        include: { payload: true, errors: true },
      }),
      prisma.revenueEvent.count({ where }),
    ]);

    return NextResponse.json({
      events,
      pagination: {
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
        limit: pagination.pageSize,
        offset,
      },
    });
  } catch (error) {
    console.error("Revenue event list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch revenue events" },
      { status: 500 },
    );
  }
}

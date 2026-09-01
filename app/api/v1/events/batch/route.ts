import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  ingestRevenueEvent,
  parseRevenueEventCsv,
  RevenueEventConflictError,
  RevenueEventValidationError,
  revenueEventInputSchema,
} from "@/lib/revenue-events";
import { toInputJson } from "@/lib/json";
import { badRequest, requireUser } from "@/lib/security/authz";
import {
  crossOriginBlocked,
  isCrossOriginStateChange,
  readJson,
} from "@/lib/security/http";
import { rateLimitResponse } from "@/lib/ai/rate-limit";
import { z } from "zod";

const batchEventSchema = z.union([
  z.object({ events: z.array(revenueEventInputSchema).min(1).max(200) }).strict(),
  z.object({ csv: z.string().min(1).max(500 * 1024) }).strict(),
]);

type BatchResult = {
  accepted: number;
  rejected: number;
  duplicates: number;
  quarantined: number;
  errors: Array<{ sourceEventId: string; code: string; message: string }>;
  createdCases: number;
  attachedCases: number;
};

export async function POST(request: NextRequest) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;
    if (isCrossOriginStateChange(request)) return crossOriginBlocked();

    const limit = rateLimitResponse("revenue:batch", who.userId);
    if (!limit.ok) return NextResponse.json(limit.body, { status: limit.status });

    const contentType = request.headers.get("content-type") || "";
    let events;
    if (contentType.includes("text/csv")) {
      const csv = await request.text();
      if (new TextEncoder().encode(csv).byteLength > 500 * 1024) {
        return badRequest("CSV payload exceeds the 500 KB demo batch limit");
      }
      events = parseRevenueEventCsv(csv);
    } else {
      const body = await readJson<unknown>(request, { maxBytes: 500 * 1024 });
      if (!body.ok) return body.response;
      const validated = batchEventSchema.parse(body.data);
      events = "events" in validated ? validated.events : parseRevenueEventCsv(validated.csv);
    }
    if (events.length > 200) return badRequest("Batch accepts at most 200 events");

    const results: BatchResult = {
      accepted: 0,
      rejected: 0,
      duplicates: 0,
      quarantined: 0,
      errors: [],
      createdCases: 0,
      attachedCases: 0,
    };

    for (const event of events) {
      try {
        const result = await ingestRevenueEvent(who.userId, event);
        if (result.status === "duplicate") {
          results.duplicates += 1;
        } else if (result.status === "quarantined") {
          results.quarantined += 1;
          results.errors.push({
            sourceEventId: event.sourceEventId,
            code: result.code,
            message: result.message,
          });
        } else {
          results.accepted += 1;
          if (result.caseDisposition === "created") results.createdCases += 1;
          else results.attachedCases += 1;
        }
      } catch (error) {
        results.rejected += 1;
        results.errors.push({
          sourceEventId: event.sourceEventId,
          code:
            error instanceof RevenueEventValidationError
              ? error.code
              : error instanceof RevenueEventConflictError
                ? "IDENTIFIER_CONFLICT"
                : "PROCESSING_ERROR",
          message:
            error instanceof RevenueEventValidationError
              ? error.message
              : error instanceof RevenueEventConflictError
                ? "Event identifier could not be accepted"
                : "Unable to persist event",
        });
      }
    }

    await prisma.batchRun.create({
      data: {
        merchantId: who.userId,
        trigger: "BATCH_UPLOAD",
        totalEvents: events.length,
        acceptedEvents: results.accepted,
        rejectedEvents: results.rejected,
        duplicateEvents: results.duplicates,
        casesCreated: results.createdCases,
        casesUpdated: results.attachedCases,
        status: "COMPLETED",
        completedAt: new Date(),
        summary: toInputJson(results),
      },
    });

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    if (error instanceof RevenueEventValidationError) {
      return badRequest(error.message, { code: error.code });
    }
    console.error("Batch revenue event ingestion error:", error);
    return NextResponse.json(
      { error: "Failed to process batch revenue events" },
      { status: 500 },
    );
  }
}

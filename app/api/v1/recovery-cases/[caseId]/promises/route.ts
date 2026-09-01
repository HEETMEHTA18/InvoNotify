import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@/lib/db";
import { rateLimitResponse } from "@/lib/ai/rate-limit";
import {
  badRequest,
  notFound,
  parseId,
  recoveryCaseScope,
  requireUser,
} from "@/lib/security/authz";
import {
  crossOriginBlocked,
  isCrossOriginStateChange,
  readJson,
} from "@/lib/security/http";
import { z } from "zod";

const createPromiseSchema = z
  .object({
    promisedAmount: z.number().finite().positive(),
    promisedAt: z.string().datetime(),
    source: z.enum(["OPERATOR", "CUSTOMER", "LLM_EXTRACTED"]).default("OPERATOR"),
    confidence: z.number().finite().min(0).max(1).optional(),
  })
  .strict();

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;
    if (isCrossOriginStateChange(request)) return crossOriginBlocked();

    const limit = rateLimitResponse("recovery:promise", who.userId);
    if (!limit.ok) return NextResponse.json(limit.body, { status: limit.status });

    const { caseId: rawCaseId } = await params;
    const caseId = parseId(rawCaseId);
    if (!caseId) return badRequest("Recovery case ID must be a positive integer");

    const body = await readJson<unknown>(request);
    if (!body.ok) return body.response;
    const validated = createPromiseSchema.parse(body.data);
    const promisedAt = new Date(validated.promisedAt);
    if (promisedAt <= new Date()) {
      return badRequest("Promised date must be in the future");
    }

    const recoveryCase = await prisma.recoveryCase.findFirst({
      where: { id: caseId, ...recoveryCaseScope(who.userId) },
      include: { promise: true, invoice: { select: { balance: true, status: true } } },
    });
    if (!recoveryCase) return notFound("Recovery case");
    if (
      recoveryCase.invoice.status === "Paid" ||
      Number(recoveryCase.invoice.balance) <= 0
    ) {
      return badRequest("Cannot create a promise for a fully paid invoice");
    }
    if (recoveryCase.promise) {
      return NextResponse.json(
        { error: "A promise already exists for this recovery case" },
        { status: 409 },
      );
    }
    if (validated.promisedAmount > Number(recoveryCase.invoice.balance)) {
      return badRequest("Promised amount cannot exceed the outstanding invoice balance");
    }

    const reviewRequired =
      validated.source === "LLM_EXTRACTED" && (validated.confidence ?? 1) < 0.7;
    const promise = await prisma.$transaction(async (tx) => {
      const createdPromise = await tx.promiseToPay.create({
        data: {
          recoveryCaseId: recoveryCase.id,
          promisedAmount: validated.promisedAmount,
          promisedAt,
          source: validated.source,
          confidence: validated.confidence,
          status: reviewRequired ? "REVIEW_REQUIRED" : "ACTIVE",
        },
      });

      await tx.promiseEvent.create({
        data: {
          promiseId: createdPromise.id,
          eventType: reviewRequired ? "PROMISE_REVIEW_REQUIRED" : "PROMISE_CREATED",
          amount: validated.promisedAmount,
          source: validated.source,
          note: "Promise created via " + validated.source,
        },
      });

      if (reviewRequired) {
        await tx.humanReview.create({
          data: {
            recoveryCaseId: recoveryCase.id,
            reviewerId: who.userId,
            status: "PENDING",
          },
        });
      }

      const updatedCase = await tx.recoveryCase.updateMany({
        where: { id: recoveryCase.id, ...recoveryCaseScope(who.userId) },
        data: reviewRequired
          ? { stage: "AWAITING_APPROVAL", status: "AWAITING_APPROVAL" }
          : { stage: "PROMISED", status: "PROMISED" },
      });
      if (updatedCase.count === 0) {
        throw new Error("Recovery case is no longer available");
      }

      return createdPromise;
    });

    return NextResponse.json({ promise }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { error: "A promise already exists for this recovery case" },
        { status: 409 },
      );
    }
    console.error("Promise creation error:", error);
    return NextResponse.json(
      { error: "Failed to create promise" },
      { status: 500 },
    );
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;

    const { caseId: rawCaseId } = await params;
    const caseId = parseId(rawCaseId);
    if (!caseId) return badRequest("Recovery case ID must be a positive integer");

    const recoveryCase = await prisma.recoveryCase.findFirst({
      where: { id: caseId, ...recoveryCaseScope(who.userId) },
      include: { promise: { include: { reminders: true, events: true } } },
    });
    if (!recoveryCase) return notFound("Recovery case");

    return NextResponse.json(recoveryCase.promise);
  } catch (error) {
    console.error("Promise fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch promise" },
      { status: 500 },
    );
  }
}

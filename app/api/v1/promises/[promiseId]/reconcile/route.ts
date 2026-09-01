import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@/lib/db";
import {
  recordConfirmedRecoveryPaymentInTransaction,
  resolveRecoveryCaseForPaidInvoiceInTransaction,
} from "@/lib/ai/orchestrator";
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

const reconcileSchema = z
  .object({
    fulfilledAmount: z.number().finite().nonnegative(),
    fulfilledAt: z.string().datetime().optional(),
    status: z.enum(["FULFILLED", "MISSED", "PARTIAL"]),
    // This is a Payment.transactionId (or the caller's own numeric Payment id),
    // not a free-form amount proof.
    paymentId: z.string().trim().min(1).max(255).optional(),
    note: z.string().trim().max(2_000).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status !== "MISSED" && !value.paymentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paymentId"],
        message: "A confirmed payment reference is required",
      });
    }
    if (value.status === "MISSED" && value.fulfilledAmount !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fulfilledAmount"],
        message: "A missed promise cannot include a fulfilled amount",
      });
    }
  });

class PromiseReconciliationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "PromiseReconciliationError";
  }
}

function toPaise(value: number): number {
  return Math.round(value * 100);
}

function paymentReferenceWhere(reference: string): Prisma.PaymentWhereInput {
  const localPaymentId = parseId(reference);
  return localPaymentId
    ? { OR: [{ id: localPaymentId }, { transactionId: reference }] }
    : { transactionId: reference };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ promiseId: string }> },
) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;
    if (isCrossOriginStateChange(request)) return crossOriginBlocked();

    const limit = rateLimitResponse("recovery:promise", who.userId);
    if (!limit.ok) return NextResponse.json(limit.body, { status: limit.status });

    const { promiseId: rawPromiseId } = await params;
    const promiseId = parseId(rawPromiseId);
    if (!promiseId) return badRequest("Promise ID must be a positive integer");

    const body = await readJson<unknown>(request);
    if (!body.ok) return body.response;
    const validated = reconcileSchema.parse(body.data);
    const reportedAt = validated.fulfilledAt ? new Date(validated.fulfilledAt) : new Date();

    const result = await prisma.$transaction(async (tx) => {
      const promise = await tx.promiseToPay.findFirst({
        where: {
          id: promiseId,
          recoveryCase: { is: recoveryCaseScope(who.userId) },
        },
        include: {
          recoveryCase: {
            include: {
              invoice: { select: { id: true, balance: true, status: true } },
            },
          },
        },
      });
      if (!promise) {
        throw new PromiseReconciliationError("Promise not found", 404);
      }
      if (promise.status === "FULFILLED" || promise.status === "MISSED") {
        throw new PromiseReconciliationError("Promise already reconciled", 409);
      }
      if (promise.status === "REVIEW_REQUIRED") {
        throw new PromiseReconciliationError(
          "Promise requires human review before reconciliation",
          409,
        );
      }

      if (validated.status === "MISSED") {
        const updatedPromise = await tx.promiseToPay.update({
          where: { id: promise.id },
          data: {
            status: "MISSED",
            missedAt: reportedAt,
            escalatedAt: reportedAt,
          },
        });
        await tx.promiseEvent.create({
          data: {
            promiseId: promise.id,
            eventType: "PROMISE_MISSED",
            amount: 0,
            source: "OPERATOR",
            note: validated.note ?? "Promise marked as missed",
          },
        });
        await tx.recoveryCase.updateMany({
          where: { id: promise.recoveryCaseId, ...recoveryCaseScope(who.userId) },
          data: { status: "ESCALATED", stage: "ESCALATED" },
        });
        await tx.escalation.create({
          data: {
            recoveryCaseId: promise.recoveryCaseId,
            reason: "Promise to pay missed",
            priority: "HIGH",
            status: "OPEN",
          },
        });
        return { promise: updatedPromise, reconciliation: "MISSED" as const };
      }

      const payment = await tx.payment.findFirst({
        where: {
          invoiceId: promise.recoveryCase.invoiceId,
          ...paymentReferenceWhere(validated.paymentId as string),
        },
        select: { id: true, amount: true, date: true },
      });
      if (!payment) {
        throw new PromiseReconciliationError(
          "Confirmed payment reference was not found for this invoice",
          404,
        );
      }
      if (payment.date < promise.capturedAt) {
        throw new PromiseReconciliationError(
          "Payment predates this promise and cannot fulfil it",
        );
      }
      if (toPaise(validated.fulfilledAmount) !== toPaise(Number(payment.amount))) {
        throw new PromiseReconciliationError(
          "Fulfilled amount must match the confirmed payment amount",
        );
      }

      const paymentsSincePromise = await tx.payment.findMany({
        where: {
          invoiceId: promise.recoveryCase.invoiceId,
          date: { gte: promise.capturedAt },
        },
        select: { id: true, amount: true },
      });
      const actualFulfilledAmount = Math.min(
        Number(promise.promisedAmount),
        paymentsSincePromise.reduce((total, item) => total + Number(item.amount), 0),
      );
      const fullyFulfilled =
        toPaise(actualFulfilledAmount) >= toPaise(Number(promise.promisedAmount));
      if (validated.status === "FULFILLED" && !fullyFulfilled) {
        throw new PromiseReconciliationError(
          "Confirmed payments do not yet fulfil the promised amount; use PARTIAL",
        );
      }

      // Recovery cash remains a function of Payment rows only. The unique
      // settlement ledger makes this safe to run when reconciling historical
      // payments as well as when retrying a webhook-backed payment.
      for (const confirmedPayment of paymentsSincePromise) {
        await recordConfirmedRecoveryPaymentInTransaction(tx, {
          invoiceId: promise.recoveryCase.invoiceId,
          paymentId: confirmedPayment.id,
          confirmedPaymentAmount: Number(confirmedPayment.amount),
        });
      }
      const recoveryCaseResolved = await resolveRecoveryCaseForPaidInvoiceInTransaction(
        tx,
        promise.recoveryCase.invoiceId,
      );

      const updatedPromise = await tx.promiseToPay.update({
        where: { id: promise.id },
        data: {
          status: fullyFulfilled ? "FULFILLED" : "ACTIVE",
          fulfilledAmount: actualFulfilledAmount,
          fulfilledAt: fullyFulfilled ? payment.date : null,
          missedAt: null,
          escalatedAt: null,
        },
      });
      await tx.promiseEvent.create({
        data: {
          promiseId: promise.id,
          eventType: fullyFulfilled ? "PROMISE_FULFILLED" : "PROMISE_PARTIAL",
          amount: Number(payment.amount),
          source: "CONFIRMED_PAYMENT",
          note:
            validated.note ??
            "Reconciled against confirmed payment " + payment.id,
        },
      });

      if (!recoveryCaseResolved) {
        await tx.recoveryCase.updateMany({
          where: { id: promise.recoveryCaseId, ...recoveryCaseScope(who.userId) },
          data: fullyFulfilled
            ? { status: "OPEN", stage: "IN_RECOVERY" }
            : { status: "PROMISED", stage: "PROMISED" },
        });
      }

      return {
        promise: updatedPromise,
        reconciliation: fullyFulfilled ? ("FULFILLED" as const) : ("PARTIAL" as const),
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    if (error instanceof PromiseReconciliationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Promise reconciliation error:", error);
    return NextResponse.json(
      { error: "Failed to reconcile promise" },
      { status: 500 },
    );
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ promiseId: string }> },
) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;

    const { promiseId: rawPromiseId } = await params;
    const promiseId = parseId(rawPromiseId);
    if (!promiseId) return badRequest("Promise ID must be a positive integer");

    const promise = await prisma.promiseToPay.findFirst({
      where: {
        id: promiseId,
        recoveryCase: { is: recoveryCaseScope(who.userId) },
      },
      include: { reminders: true, events: true, recoveryCase: true },
    });
    if (!promise) return notFound("Promise");

    return NextResponse.json(promise);
  } catch (error) {
    console.error("Promise fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch promise" },
      { status: 500 },
    );
  }
}

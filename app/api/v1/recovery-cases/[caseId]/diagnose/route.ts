import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toInputJson } from "@/lib/json";
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

const FAILURE_TAXONOMY: Record<
  string,
  { category: string; retryable: boolean; actionFamily: string; description: string }
> = {
  PAYMENT_DECLINED_INSUFFICIENT_FUNDS: { category: "PAYMENT_FAILURE", retryable: true, actionFamily: "RETRY_PAYMENT", description: "Customer has insufficient funds" },
  PAYMENT_DECLINED_CARD_EXPIRED: { category: "PAYMENT_FAILURE", retryable: false, actionFamily: "UPDATE_PAYMENT_METHOD", description: "Payment card has expired" },
  PAYMENT_DECLINED_CARD_BLOCKED: { category: "PAYMENT_FAILURE", retryable: false, actionFamily: "UPDATE_PAYMENT_METHOD", description: "Card blocked by issuer" },
  PAYMENT_DECLINED_FRAUD_SUSPECTED: { category: "PAYMENT_FAILURE", retryable: false, actionFamily: "MANUAL_REVIEW", description: "Transaction flagged as fraud" },
  PAYMENT_DECLINED_DO_NOT_HONOR: { category: "PAYMENT_FAILURE", retryable: true, actionFamily: "RETRY_PAYMENT", description: "Issuer declined - do not honor" },
  PAYMENT_DECLINED_LIMIT_EXCEEDED: { category: "PAYMENT_FAILURE", retryable: false, actionFamily: "UPDATE_PAYMENT_METHOD", description: "Transaction exceeds card limit" },
  MANDATE_FAILED: { category: "MANDATE_FAILURE", retryable: true, actionFamily: "RETRY_MANDATE", description: "Auto-debit mandate failed" },
  MANDATE_EXPIRED: { category: "MANDATE_FAILURE", retryable: false, actionFamily: "RECREATE_MANDATE", description: "Mandate has expired" },
  MANDATE_REVOKED: { category: "MANDATE_FAILURE", retryable: false, actionFamily: "RECREATE_MANDATE", description: "Customer revoked mandate" },
  CHECKOUT_ABANDONED: { category: "CHECKOUT_ABANDONMENT", retryable: true, actionFamily: "SEND_REMINDER", description: "Customer abandoned checkout" },
  CHECKOUT_EXPIRED: { category: "CHECKOUT_ABANDONMENT", retryable: true, actionFamily: "SEND_PAYMENT_LINK", description: "Checkout session expired" },
  SUBSCRIPTION_PAYMENT_FAILED: { category: "SUBSCRIPTION_FAILURE", retryable: true, actionFamily: "RETRY_SUBSCRIPTION", description: "Recurring subscription payment failed" },
  SUBSCRIPTION_CANCELLED: { category: "SUBSCRIPTION_FAILURE", retryable: false, actionFamily: "WINBACK", description: "Subscription cancelled by customer" },
  INVOICE_OVERDUE: { category: "OVERDUE_RECEIVABLE", retryable: true, actionFamily: "CHASE_RECEIVABLE", description: "Invoice past due date" },
  INVOICE_DISPUTED: { category: "OVERDUE_RECEIVABLE", retryable: false, actionFamily: "DISPUTE_RESOLUTION", description: "Customer disputed invoice" },
  BANK_ACCOUNT_CLOSED: { category: "BANKING_ISSUE", retryable: false, actionFamily: "UPDATE_BANK_DETAILS", description: "Customer bank account closed" },
  TECHNICAL_ERROR: { category: "TECHNICAL", retryable: true, actionFamily: "RETRY_PAYMENT", description: "Gateway/technical error" },
  NETWORK_TIMEOUT: { category: "TECHNICAL", retryable: true, actionFamily: "RETRY_PAYMENT", description: "Network timeout during payment" },
  CUSTOMER_UNREACHABLE: { category: "COMMUNICATION_FAILURE", retryable: false, actionFamily: "ESCALATE", description: "Customer unreachable" },
};

const diagnoseSchema = z
  .object({
    failureCode: z.string().trim().min(1).max(120).optional(),
    failureReason: z.string().trim().min(1).max(2_000).optional(),
    paymentMethod: z.string().trim().min(1).max(120).optional(),
    gatewayContext: z.record(z.string(), z.unknown()).optional(),
    attemptHistory: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
  })
  .strict();

type Evidence = {
  source: string;
  rawValue: unknown;
  interpretation: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;
    if (isCrossOriginStateChange(request)) return crossOriginBlocked();

    const limit = rateLimitResponse("recovery:diagnose", who.userId);
    if (!limit.ok) return NextResponse.json(limit.body, { status: limit.status });

    const { caseId: rawCaseId } = await params;
    const caseId = parseId(rawCaseId);
    if (!caseId) return badRequest("Recovery case ID must be a positive integer");

    const body = await readJson<unknown>(request);
    if (!body.ok) return body.response;
    const validated = diagnoseSchema.parse(body.data);

    const recoveryCase = await prisma.recoveryCase.findFirst({
      where: { id: caseId, ...recoveryCaseScope(who.userId) },
      include: {
        invoice: {
          include: {
            customerRel: true,
            payments: { orderBy: { date: "desc" }, take: 10 },
          },
        },
        revenueEvents: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    });
    if (!recoveryCase) return notFound("Recovery case");
    if (
      recoveryCase.invoice.status === "Paid" ||
      Number(recoveryCase.invoice.balance) <= 0
    ) {
      return badRequest("Cannot diagnose a fully paid invoice");
    }

    const revenueEvent = recoveryCase.revenueEvents[0];
    const failureCode = validated.failureCode ?? revenueEvent?.failureCode ?? "UNKNOWN";
    const taxonomy = FAILURE_TAXONOMY[failureCode];
    const evidence: Evidence[] = [];

    const canonicalCause = taxonomy?.description ?? "Unknown failure - requires manual review";
    const category = taxonomy?.category ?? "UNKNOWN";
    const confidence = taxonomy ? 0.85 : 0.1;
    const retryable = taxonomy?.retryable ?? false;
    const actionFamily = taxonomy?.actionFamily ?? "REVIEW_REQUIRED";
    const reasoning = taxonomy
      ? "Mapped failure code " + failureCode + " to " + taxonomy.category + ": " + taxonomy.description
      : "Failure code " + failureCode + " is not in the taxonomy. Manual review is required.";

    evidence.push({
      source: "failure_code_mapping",
      rawValue: failureCode,
      interpretation: taxonomy
        ? "Direct mapping to " + taxonomy.category + " with action family " + taxonomy.actionFamily
        : "No matching taxonomy entry - flagged for review",
    });

    if (validated.failureReason || validated.paymentMethod || validated.gatewayContext) {
      evidence.push({
        source: "request_context",
        rawValue: {
          failureReason: validated.failureReason,
          paymentMethod: validated.paymentMethod,
          gatewayContext: validated.gatewayContext,
        },
        interpretation: "Operator-supplied failure context",
      });
    }

    if (recoveryCase.invoice.customerRel) {
      const customer = recoveryCase.invoice.customerRel;
      evidence.push({
        source: "customer_profile",
        rawValue: {
          cibilScore: customer.cibilScore,
          isVipExempt: customer.isVipExempt,
          communicationOptOut: customer.communicationOptOut,
          firstInvoiceAt: customer.firstInvoiceAt,
        },
        interpretation:
          "Customer CIBIL: " +
          customer.cibilScore +
          ", VIP: " +
          customer.isVipExempt +
          ", OptOut: " +
          customer.communicationOptOut,
      });
    }

    if (recoveryCase.invoice.payments.length > 0) {
      const recentPayments = recoveryCase.invoice.payments.slice(0, 5);
      const failedCount = recentPayments.filter((payment) =>
        payment.method.includes("FAILED"),
      ).length;
      evidence.push({
        source: "payment_history",
        rawValue: recentPayments.map((payment) => ({
          amount: payment.amount,
          method: payment.method,
          date: payment.date,
        })),
        interpretation: "Recent payments: " + recentPayments.length + ", Failed: " + failedCount,
      });
    }

    if (validated.attemptHistory?.length) {
      evidence.push({
        source: "attempt_history",
        rawValue: validated.attemptHistory,
        interpretation: "Previous recovery attempts: " + validated.attemptHistory.length,
      });
    }

    const diagnosis = await prisma.$transaction(async (tx) => {
      if (taxonomy) {
        await tx.failureTaxonomy.upsert({
          where: { code: failureCode },
          update: {
            category: taxonomy.category,
            description: taxonomy.description,
            retryable: taxonomy.retryable,
            actionFamily: taxonomy.actionFamily,
          },
          create: {
            code: failureCode,
            category: taxonomy.category,
            description: taxonomy.description,
            retryable: taxonomy.retryable,
            actionFamily: taxonomy.actionFamily,
          },
        });
      }

      const savedDiagnosis = await tx.failureDiagnosis.upsert({
        where: { recoveryCaseId: recoveryCase.id },
        update: {
          taxonomyCode: taxonomy ? failureCode : null,
          canonicalCause,
          category,
          confidence,
          reasoning,
          evidence: toInputJson(evidence),
          status: taxonomy ? "COMPLETED" : "REVIEW_REQUIRED",
          modelVersion: "v1.0.0",
        },
        create: {
          recoveryCaseId: recoveryCase.id,
          taxonomyCode: taxonomy ? failureCode : null,
          canonicalCause,
          category,
          confidence,
          reasoning,
          evidence: toInputJson(evidence),
          status: taxonomy ? "COMPLETED" : "REVIEW_REQUIRED",
          modelVersion: "v1.0.0",
        },
      });

      // Re-diagnosis replaces the evidence set instead of silently appending
      // duplicate facts on every retry.
      await tx.diagnosticEvidence.deleteMany({
        where: { diagnosisId: savedDiagnosis.id },
      });
      if (evidence.length > 0) {
        await tx.diagnosticEvidence.createMany({
          data: evidence.map((item) => ({
            diagnosisId: savedDiagnosis.id,
            source: item.source,
            rawValue: toInputJson(item.rawValue),
            interpretation: item.interpretation,
          })),
        });
      }

      await tx.recoveryCase.updateMany({
        where: { id: recoveryCase.id, ...recoveryCaseScope(who.userId) },
        data: { stage: "DIAGNOSED" },
      });
      return savedDiagnosis;
    });

    return NextResponse.json({
      diagnosis: {
        id: diagnosis.id,
        canonicalCause: diagnosis.canonicalCause,
        category: diagnosis.category,
        confidence: Number(diagnosis.confidence),
        retryable,
        actionFamily,
        reasoning: diagnosis.reasoning,
        evidence: diagnosis.evidence,
        status: diagnosis.status,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    console.error("Failure diagnosis error:", error);
    return NextResponse.json(
      { error: "Failed to diagnose failure" },
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
      select: { id: true },
    });
    if (!recoveryCase) return notFound("Recovery case");

    const diagnosis = await prisma.failureDiagnosis.findUnique({
      where: { recoveryCaseId: recoveryCase.id },
      include: { evidenceItems: true, taxonomy: true },
    });
    if (!diagnosis) return notFound("Diagnosis");

    return NextResponse.json(diagnosis);
  } catch (error) {
    console.error("Diagnosis fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch diagnosis" },
      { status: 500 },
    );
  }
}

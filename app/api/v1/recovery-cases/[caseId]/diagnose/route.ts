import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toInputJson } from "@/lib/json";
import { rateLimitResponse } from "@/lib/ai/rate-limit";
import { diagnoseFailure, mapToTaxonomyCode } from "@/lib/ai/ml/diagnosis-model";
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
    const evidence: Evidence[] = [];

    // Gather customer features for ML diagnosis
    const customer = recoveryCase.invoice.customerRel;
    const customerHistory = await prisma.invoice.findMany({
      where: {
        customerId: recoveryCase.invoice.customerId,
        ownerUserId: who.userId,
        status: "Paid",
      },
      select: { id: true },
    });
    const totalInvoiceCount = customerHistory.length + 1;
    const paymentSuccessRate = totalInvoiceCount > 0 ? customerHistory.length / totalInvoiceCount : 0.5;

    const failedPayments = await prisma.payment.count({
      where: {
        invoiceId: recoveryCase.invoiceId,
        method: { contains: "FAILED" },
      },
    });

    // Run ML diagnosis
    const mlDiagnosis = diagnoseFailure({
      failureCode,
      failureReason: validated.failureReason || null,
      daysOverdue: recoveryCase.invoice.dueDate
        ? Math.floor((Date.now() - recoveryCase.invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0,
      amountDue: Number(recoveryCase.invoice.balance),
      paymentSuccessRate,
      previousFailures: failedPayments,
      cibilScore: customer?.cibilScore ?? 650,
      totalInvoiceCount,
      hasMandate: false,
      paymentMethod: validated.paymentMethod || null,
    });

    // Fall back to static taxonomy if ML confidence is low
    const staticTaxonomy = FAILURE_TAXONOMY[failureCode];
    const useML = mlDiagnosis.confidence > 0.6;
    const category = useML ? mlDiagnosis.category : (staticTaxonomy?.category ?? "UNKNOWN");
    const confidence = useML ? mlDiagnosis.confidence : (staticTaxonomy ? 0.85 : 0.1);
    const retryable = staticTaxonomy?.retryable ?? (mlDiagnosis.confidence > 0.7);
    const actionFamily = staticTaxonomy?.actionFamily ?? "REVIEW_REQUIRED";
    const taxonomyCode = useML ? mapToTaxonomyCode(mlDiagnosis.category) : (staticTaxonomy ? failureCode : null);

    const canonicalCause = useML
      ? `ML prediction: ${mlDiagnosis.category} (confidence: ${(mlDiagnosis.confidence * 100).toFixed(1)}%)`
      : staticTaxonomy?.description ?? "Unknown failure - requires manual review";

    const reasoning = useML
      ? `ML model diagnosed ${mlDiagnosis.category} based on ${mlDiagnosis.contributions.length} features. Top contributors: ${mlDiagnosis.contributions.slice(0, 3).map((c) => `${c.feature}=${c.contribution.toFixed(3)}`).join(", ")}`
      : staticTaxonomy
        ? "Mapped failure code " + failureCode + " to " + staticTaxonomy.category + ": " + staticTaxonomy.description
        : "Failure code " + failureCode + " is not in the taxonomy. Manual review is required.";

    evidence.push({
      source: useML ? "ml_diagnosis_model" : "failure_code_mapping",
      rawValue: useML
        ? { model: "diagnosis-ml-v1", category: mlDiagnosis.category, confidence: mlDiagnosis.confidence, candidates: mlDiagnosis.candidates }
        : failureCode,
      interpretation: useML
        ? `ML model predicted ${mlDiagnosis.category} with ${(mlDiagnosis.confidence * 100).toFixed(1)}% confidence`
        : staticTaxonomy
          ? "Direct mapping to " + staticTaxonomy.category + " with action family " + staticTaxonomy.actionFamily
          : "No matching taxonomy entry - flagged for review",
    });

    // Add ML feature contributions as evidence
    if (useML && mlDiagnosis.contributions.length > 0) {
      evidence.push({
        source: "ml_feature_contributions",
        rawValue: mlDiagnosis.contributions,
        interpretation: `Feature importance: ${mlDiagnosis.contributions.slice(0, 5).map((c) => `${c.feature}(${c.contribution > 0 ? "+" : ""}${c.contribution.toFixed(3)})`).join(", ")}`,
      });
    }

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
      if (taxonomyCode && staticTaxonomy) {
        await tx.failureTaxonomy.upsert({
          where: { code: failureCode },
          update: {
            category: staticTaxonomy.category,
            description: staticTaxonomy.description,
            retryable: staticTaxonomy.retryable,
            actionFamily: staticTaxonomy.actionFamily,
          },
          create: {
            code: failureCode,
            category: staticTaxonomy.category,
            description: staticTaxonomy.description,
            retryable: staticTaxonomy.retryable,
            actionFamily: staticTaxonomy.actionFamily,
          },
        });
      }

      const savedDiagnosis = await tx.failureDiagnosis.upsert({
        where: { recoveryCaseId: recoveryCase.id },
        update: {
          taxonomyCode,
          canonicalCause,
          category,
          confidence,
          reasoning,
          evidence: toInputJson(evidence),
          status: confidence >= 0.5 ? "COMPLETED" : "REVIEW_REQUIRED",
          modelVersion: useML ? "diagnosis-ml-v1" : "v1.0.0",
        },
        create: {
          recoveryCaseId: recoveryCase.id,
          taxonomyCode,
          canonicalCause,
          category,
          confidence,
          reasoning,
          evidence: toInputJson(evidence),
          status: confidence >= 0.5 ? "COMPLETED" : "REVIEW_REQUIRED",
          modelVersion: useML ? "diagnosis-ml-v1" : "v1.0.0",
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
        modelVersion: useML ? "diagnosis-ml-v1" : "v1.0.0",
        mlPrediction: useML ? {
          candidates: mlDiagnosis.candidates,
          contributions: mlDiagnosis.contributions,
        } : null,
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

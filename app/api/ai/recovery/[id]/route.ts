import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const caseId = Number(id);
  if (!Number.isInteger(caseId)) {
    return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
  }

  try {
    const recoveryCase = await prisma.recoveryCase.findFirst({
      where: {
        id: caseId,
        OR: [{ ownerUserId: userId }, { invoice: { ownerUserId: userId } }],
      },
      include: {
        invoice: {
          include: {
            payments: { orderBy: { date: "desc" }, take: 10 },
            reminderLogs: { orderBy: { sentAt: "desc" }, take: 10 },
          },
        },
        actions: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!recoveryCase) {
      return NextResponse.json({ error: "Recovery case not found" }, { status: 404 });
    }

    const invoice = recoveryCase.invoice;
    const now = new Date();
    const daysOverdue =
      invoice.dueDate && new Date(invoice.dueDate) < now
        ? Math.max(
            0,
            Math.round(
              (now.getTime() - new Date(invoice.dueDate).getTime()) /
                (24 * 60 * 60 * 1000),
            ),
          )
        : 0;

    return NextResponse.json({
      case: {
        id: recoveryCase.id,
        invoiceId: recoveryCase.invoiceId,
        status: recoveryCase.status,
        stage: recoveryCase.stage,
        riskScore: Number(recoveryCase.riskScore),
        paymentProbability: Number(recoveryCase.paymentProbability),
        amountAtRisk: Number(recoveryCase.amountAtRisk),
        recoveredAmount: Number(recoveryCase.recoveredAmount),
        expectedRecovery: Number(recoveryCase.expectedRecovery),
        lastDecision: recoveryCase.lastDecision,
        strategy: recoveryCase.strategy,
        nextActionAt: recoveryCase.nextActionAt,
        createdAt: recoveryCase.createdAt,
        updatedAt: recoveryCase.updatedAt,
        resolvedAt: recoveryCase.resolvedAt,
        invoice: {
          invoiceNumber: invoice.invoiceNumber,
          clientName: invoice.clientName || invoice.customer,
          clientEmail: invoice.clientEmail,
          amount: Number(invoice.total),
          amountPaid: Number(invoice.amountPaid),
          balance: Number(invoice.balance),
          currency: invoice.currency,
          status: invoice.status,
          dueDate: invoice.dueDate,
          daysOverdue,
          payments: invoice.payments.map((p) => ({
            amount: Number(p.amount),
            method: p.method,
            date: p.date,
            transactionId: p.transactionId,
          })),
          reminders: invoice.reminderLogs.map((r) => ({
            reminderType: r.reminderType,
            sentAt: r.sentAt,
          })),
        },
        actions: recoveryCase.actions.map((a) => ({
          id: a.id,
          actionType: a.actionType,
          channel: a.channel,
          riskScore: Number(a.riskScore),
          reason: a.reason,
          urgency: a.urgency,
          confidence: a.confidence ? Number(a.confidence) : null,
          decision: a.decision,
          policyResult: a.policyResult,
          policyReasons: a.policyReasons,
          approvalRequired: a.approvalRequired,
          status: a.status,
          executionStatus: a.executionStatus,
          failureReason: a.failureReason,
          fallbackUsed: a.fallbackUsed,
          provider: a.provider,
          payload: a.payload,
          createdAt: a.createdAt,
          completedAt: a.completedAt,
        })),
      },
    });
  } catch (error) {
    console.error("Failed to load recovery case:", error);
    return NextResponse.json({ error: "Failed to load recovery case" }, { status: 500 });
  }
}

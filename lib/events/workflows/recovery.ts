import { prisma } from "@/lib/db";
import { onEvent, emitEvent } from "../bus";
import {
  isTerminalRecoveryCaseStatus,
  runRecoverySweep,
  resolveRecoveryCaseForPaidInvoice,
} from "@/lib/ai/orchestrator";
import type {
  InvoiceOverdueEvent,
  InvoicePaidEvent,
  RazorpayPaymentLinkEvent,
  RazorpayPaymentEvent,
} from "../types";

/**
 * Recovery workflow: connects invoice/payment events to the AI recovery system.
 *
 * This module registers event handlers that:
 *   1. Invoice overdue  → Create recovery case and run recovery sweep
 *   2. Invoice paid     → Close any open recovery case
 *   3. Payment link paid → Record payment and close recovery case
 *   4. Payment link expired → Trigger re-engagement
 *   5. Payment failed   → Log and potentially trigger retry
 *
 * Call `initRecoveryWorkflows()` once at app startup to register handlers.
 */

export function initRecoveryWorkflows(): void {
  // ── Invoice Overdue → Trigger Recovery ────────────────────────────────────
  onEvent<InvoiceOverdueEvent>("invoice.overdue", async (event) => {
    console.log(
      `[RecoveryWorkflow] Invoice ${event.invoiceId} overdue by ${event.daysOverdue} days — running recovery sweep`,
    );

    const result = await runRecoverySweep({
      invoiceId: event.invoiceId,
      trigger: "WEBHOOK",
    });

    console.log(
      `[RecoveryWorkflow] Sweep complete: ${result.actions} actions taken, ₹${result.expectedRecoveryAmount} expected recovery, ₹${result.recoveredAmount} confirmed`,
    );
  });

  // ── Invoice Paid → Close Recovery Case ────────────────────────────────────
  onEvent<InvoicePaidEvent>("invoice.paid", async (event) => {
    console.log(
      `[RecoveryWorkflow] Invoice ${event.invoiceId} paid — closing recovery case`,
    );

    await resolveRecoveryCaseForPaidInvoice(event.invoiceId);

    await emitEvent({
      type: "recovery.case_resolved",
      source: "webhook",
      invoiceId: event.invoiceId,
      recoveryCaseId: 0, // Will be resolved inside the function
      resolvedBy: "payment",
      payload: { amountPaid: event.amountPaid },
    });
  });

  // ── Razorpay Payment Link Paid → Record & Close ──────────────────────────
  onEvent<RazorpayPaymentLinkEvent>("payment_link.paid", async (event) => {
    const paymentLinkPayload = (event.payload as Record<string, unknown>).payment_link as Record<string, unknown> | undefined;
    const paymentLink = paymentLinkPayload?.entity as Record<string, unknown> | undefined;
    if (!paymentLink) return;

    const referenceId = paymentLink.reference_id as string | null;
    if (!referenceId) return;

    const invoiceId = parseInt(referenceId, 10);
    if (isNaN(invoiceId)) return;

    console.log(
      `[RecoveryWorkflow] Razorpay payment link paid for invoice ${invoiceId}`,
    );

    await resolveRecoveryCaseForPaidInvoice(invoiceId);

    await emitEvent({
      type: "recovery.case_resolved",
      source: "orchestrator",
      invoiceId,
      recoveryCaseId: 0,
      resolvedBy: "payment",
      payload: { paymentLinkId: paymentLink.id },
    });
  });

  // ── Razorpay Payment Link Expired → Re-engage ────────────────────────────
  onEvent<RazorpayPaymentLinkEvent>("payment_link.expired", async (event) => {
    const paymentLinkPayload = (event.payload as Record<string, unknown>).payment_link as Record<string, unknown> | undefined;
    const paymentLink = paymentLinkPayload?.entity as Record<string, unknown> | undefined;
    if (!paymentLink) return;

    const referenceId = paymentLink.reference_id as string | null;
    if (!referenceId) return;

    const invoiceId = parseInt(referenceId, 10);
    if (isNaN(invoiceId)) return;

    console.log(
      `[RecoveryWorkflow] Razorpay payment link expired for invoice ${invoiceId} — scheduling follow-up`,
    );

    // Update recovery case to trigger next action
    const recoveryCase = await prisma.recoveryCase.findUnique({
      where: { invoiceId },
    });

    if (recoveryCase && !isTerminalRecoveryCaseStatus(recoveryCase.status)) {
      await prisma.recoveryCase.update({
        where: { id: recoveryCase.id },
        data: {
          status: "OPEN",
          stage: "EXECUTION",
          nextActionAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        },
      });
    }
  });

  // ── Razorpay Payment Failed → Log & Potentially Retry ────────────────────
  onEvent<RazorpayPaymentEvent>("payment.failed", async (event) => {
    const paymentPayload = (event.payload as Record<string, unknown>).payment as Record<string, unknown> | undefined;
    const payment = paymentPayload?.entity as Record<string, unknown> | undefined;
    if (!payment) return;

    const paymentId = payment.id as string;
    const paymentLinkId = payment.payment_link_id as string | null;

    console.log(
      `[RecoveryWorkflow] Razorpay payment failed: ${paymentId} (link: ${paymentLinkId})`,
    );

    // If it was a payment link payment that failed, we might want to trigger a retry
    if (paymentLinkId) {
      const invoice = await prisma.invoice.findFirst({
        where: { razorpayPaymentLinkId: paymentLinkId },
        select: { id: true },
      });

      if (invoice) {
        const recoveryCase = await prisma.recoveryCase.findUnique({
          where: { invoiceId: invoice.id },
        });

        if (recoveryCase && !isTerminalRecoveryCaseStatus(recoveryCase.status)) {
          // Do not insert an allow-listed retry directly from a provider event.
          // The next sweep performs diagnosis, policy evaluation and audit first.
          const nextActionAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          await prisma.$transaction([
            prisma.recoveryCase.update({
              where: { id: recoveryCase.id },
              data: { nextActionAt, stage: "ACTION_PENDING" },
            }),
            prisma.auditLog.create({
              data: {
                recoveryCaseId: recoveryCase.id,
                eventType: "PAYMENT_FAILURE_REEVALUATION_QUEUED",
                actor: "provider-workflow",
                metadata: { failedPaymentId: paymentId, nextActionAt: nextActionAt.toISOString() },
              },
            }),
          ]);
        }
      }
    }
  });

  console.log("[RecoveryWorkflow] Event handlers registered");
}

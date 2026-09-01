import type { RecoveryContext } from "../context";
import type { AgentDecision, Channel, AllowedAction } from "../agent/types";
import { sendInvoiceReminderById } from "@/lib/mail-service";
import {
  createPaymentLink,
  fetchPaymentLink,
  resendPaymentLink,
} from "@/lib/razorpay";
import { createLogger } from "../logger";

const log = createLogger("ai:actions");

export type ActionResult = {
  actionType: AllowedAction;
  status: "EXECUTED" | "SKIPPED" | "FAILED" | "SCHEDULED" | "ESCALATED";
  channel?: Channel;
  payload?: Record<string, unknown>;
  fallbackUsed: boolean;
  failureReason?: string;
  provider?: string;
  completedAt: Date;
};

export type ExecuteActionInput = {
  context: RecoveryContext;
  decision: AgentDecision;
  ownerUserId?: string | null;
  now?: Date;
};

/**
 * Turns an approved, policy-validated decision into a real side effect.
 * Every action has a graceful failure path: if the primary channel fails the
 * engine tries a fallback and, as a last resort, escalates to a human. The
 * LLM/decision agent never calls these side effects directly.
 */
export const executeAction = async (input: ExecuteActionInput): Promise<ActionResult> => {
  const { decision, now = new Date() } = input;
  const actionType = decision.recommendedAction;

  switch (actionType) {
    case "STOP":
      return {
        actionType,
        status: "SKIPPED",
        payload: { reason: "No action required" },
        fallbackUsed: false,
        provider: "noop",
        completedAt: now,
      };

    case "SCHEDULE_FOLLOWUP":
      return {
        actionType,
        status: "SCHEDULED",
        channel: decision.channel,
        payload: {
          nextActionAt: new Date(
            now.getTime() + (decision.suggestedFollowUpHours ?? 24) * 60 * 60 * 1000,
          ).toISOString(),
        },
        fallbackUsed: false,
        provider: "scheduler",
        completedAt: now,
      };

    case "ESCALATE_TO_HUMAN":
      return {
        actionType,
        status: "ESCALATED",
        channel: decision.channel,
        payload: { reason: decision.reason },
        fallbackUsed: false,
        provider: "human-review",
        completedAt: now,
      };

    case "CREATE_PAYMENT_LINK":
    case "RESEND_PAYMENT_LINK":
      return executePaymentLinkAction(input);

    case "SEND_REMINDER":
      return executeReminderAction(input);

    default:
      return {
        actionType,
        status: "FAILED",
        payload: {},
        fallbackUsed: false,
        failureReason: `Unsupported action type: ${actionType}`,
        provider: "unknown",
        completedAt: now,
      };
  }
};

const executePaymentLinkAction = async (input: ExecuteActionInput): Promise<ActionResult> => {
  const { context, decision, ownerUserId, now = new Date() } = input;
  const invoiceId = context.invoice.id;
  const actionType = decision.recommendedAction;
  const invoice = context.invoice;

  try {
    let paymentLinkUrl: string | null = null;
    let paymentLinkId: string | null = null;

    if (actionType === "RESEND_PAYMENT_LINK") {
      // For resend, check if invoice has an existing Razorpay payment link
      if (invoice.razorpayPaymentLinkId) {
        try {
          const existingLink = await fetchPaymentLink(invoice.razorpayPaymentLinkId);
          if (existingLink.status === "created" || existingLink.status === "partial") {
            // Resend the existing link
            const resentLink = await resendPaymentLink(existingLink.id);
            paymentLinkUrl = resentLink.short_url || "";
            paymentLinkId = resentLink.id;
          }
        } catch {
          // If resend fails, fall through to create new link
        }
      }
    }

    // Create new payment link if we don't have one yet
    if (!paymentLinkUrl) {
      const paymentLink = await createPaymentLink({
        amount: Math.round(invoice.balance),
        currency: invoice.currency || "INR",
        description: `Invoice ${invoice.invoiceNumber} - ${invoice.clientName}`,
        customer: {
          name: invoice.clientName,
          email: invoice.clientEmail,
          contact: invoice.clientPhone,
        },
        reference_id: String(invoiceId),
        notify: { email: true, sms: false, whatsapp: false },
        callback_url: `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/invoice/${invoiceId}/pay?payment=success`,
        callback_method: "get",
      });

      paymentLinkUrl = paymentLink.short_url;
      paymentLinkId = paymentLink.id;
    }

    if (!paymentLinkUrl) {
      return fallbackToReminder(input, "RAZORPAY_LINK_CREATION_FAILED");
    }

    // Deliver the link to the customer when resending; otherwise just mint it.
    if (actionType === "RESEND_PAYMENT_LINK") {
      const sendResult = await sendInvoiceReminderById({
        invoiceId,
        reminderType: "OVERDUE_REPEAT",
        daysOverdue: context.invoice.daysOverdue,
        channelOverride: decision.channel,
        fallbackUserId: ownerUserId || undefined,
      });

      if (!sendResult.sent) {
        return {
          actionType,
          status: "FAILED",
          channel: decision.channel,
          payload: { paymentLinkUrl, paymentLinkId },
          fallbackUsed: false,
          failureReason: sendResult.reason,
          provider: "razorpay+email",
          completedAt: now,
        };
      }
    }

    log.info("Payment link created", {
      invoiceId,
      actionType,
      paymentLinkId,
      paymentLinkUrl,
    });

    return {
      actionType,
      status: "EXECUTED",
      channel: decision.channel,
      payload: { paymentLinkUrl, paymentLinkId, customerEmail: invoice.clientEmail },
      fallbackUsed: false,
      provider: "razorpay",
      completedAt: now,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment link creation failed";
    log.error("Payment link creation failed", { invoiceId, error: message });
    return fallbackToReminder(input, message);
  }
};

const executeReminderAction = async (input: ExecuteActionInput): Promise<ActionResult> => {
  const { context, decision, ownerUserId, now = new Date() } = input;

  const sendResult = await sendInvoiceReminderById({
    invoiceId: context.invoice.id,
    reminderType: "OVERDUE_REPEAT",
    daysOverdue: context.invoice.daysOverdue,
    channelOverride: decision.channel,
    fallbackUserId: ownerUserId || undefined,
  });

  if (sendResult.sent) {
    return {
      actionType: decision.recommendedAction,
      status: "EXECUTED",
      channel: decision.channel,
      payload: { channels: sendResult.channels },
      fallbackUsed: false,
      provider: "email",
      completedAt: now,
    };
  }

  // Email failed - escalate to human (no SMS per MVP requirements)
  return {
    actionType: decision.recommendedAction,
    status: "FAILED",
    channel: decision.channel,
    payload: { emailReason: sendResult.reason },
    fallbackUsed: false,
    failureReason: `${sendResult.reason}; escalated to human review`,
    provider: "email",
    completedAt: now,
  };
};

const fallbackToReminder = async (
  input: ExecuteActionInput,
  reason: string,
): Promise<ActionResult> => {
  const { context, decision, ownerUserId, now = new Date() } = input;

  try {
    const sendResult = await sendInvoiceReminderById({
      invoiceId: context.invoice.id,
      reminderType: "OVERDUE_REPEAT",
      daysOverdue: context.invoice.daysOverdue,
      channelOverride: "EMAIL",
      fallbackUserId: ownerUserId || undefined,
    });

    if (sendResult.sent) {
      return {
        actionType: decision.recommendedAction,
        status: "EXECUTED",
        channel: "EMAIL",
        payload: { fallbackReason: reason, channels: sendResult.channels },
        fallbackUsed: true,
        provider: "email-fallback",
        completedAt: now,
      };
    }

    return {
      actionType: decision.recommendedAction,
      status: "FAILED",
      channel: decision.channel,
      payload: {},
      fallbackUsed: true,
      failureReason: `${reason}; reminder fallback also failed (${sendResult.reason})`,
      provider: "email-fallback",
      completedAt: now,
    };
  } catch (error) {
    return {
      actionType: decision.recommendedAction,
      status: "FAILED",
      channel: decision.channel,
      payload: {},
      fallbackUsed: true,
      failureReason: `${reason}; ${error instanceof Error ? error.message : "fallback failed"}`,
      provider: "email-fallback",
      completedAt: now,
    };
  }
};

/**
 * Update invoice with Razorpay payment link reference.
 * Should be called after successful payment link creation.
 */
export const storePaymentLinkOnInvoice = async (
  invoiceId: number,
  paymentLinkId: string,
  paymentLinkUrl: string,
): Promise<void> => {
  const { prisma } = await import("@/lib/db");
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      razorpayPaymentLinkId: paymentLinkId,
      razorpayPaymentLinkUrl: paymentLinkUrl,
    },
  });
};

/**
 * Clear payment link reference when link expires or is cancelled.
 */
export const clearPaymentLinkOnInvoice = async (invoiceId: number): Promise<void> => {
  const { prisma } = await import("@/lib/db");
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      razorpayPaymentLinkId: null,
      razorpayPaymentLinkUrl: null,
    },
  });
};
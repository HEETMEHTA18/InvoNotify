/**
 * Automated promise-to-pay reminder system.
 *
 * When a customer promises to pay by a certain date, this module
 * schedules and sends reminders at optimal intervals:
 *   - 24h before promised date
 *   - On the promised date (morning)
 *   - 24h after missed promise (escalation)
 *
 * Reminders are sent via the same multi-channel system (email + WhatsApp).
 */

import { prisma } from "@/lib/db";
import { sendInvoiceReminderById } from "@/lib/mail-service";

function logInfo(msg: string, data?: Record<string, unknown>) {
  console.log(`[promise-reminders] ${msg}`, data || "");
}
function logError(msg: string, error?: unknown) {
  console.error(`[promise-reminders] ${msg}`, error || "");
}

export type PromiseReminderResult = {
  promiseId: number;
  caseId: number;
  channel: string;
  status: "SENT" | "FAILED" | "SKIPPED";
  reason: string;
};

/**
 * Get all active promises that need reminders.
 */
async function getPromisesNeedingReminders(): Promise<
  Array<{
    id: number;
    recoveryCaseId: number;
    promisedAt: Date;
    promisedAmount: number;
    status: string;
    recoveryCase: {
      id: number;
      invoiceId: number;
      stage: string;
    };
    reminders: Array<{ id: number; status: string; scheduledAt: Date }>;
  }>
> {
  const now = new Date();

    return prisma.promiseToPay.findMany({
    where: {
      status: "ACTIVE",
      promisedAt: { gte: now }, // Only active promises with future promised date
    },
    include: {
      recoveryCase: {
        select: { id: true, invoiceId: true, stage: true },
      },
      reminders: {
        where: { status: "SENT" },
        orderBy: { scheduledAt: "desc" },
      },
    },
  }).then(promises => promises.map(p => ({
    ...p,
    promisedAmount: Number(p.promisedAmount),
  })));
}

/**
 * Calculate optimal reminder times for a promise.
 */
function calculateReminderSchedule(
  promisedAt: Date,
): Array<{ label: string; offsetHours: number; channel: string }> {
  const now = new Date();
  const hoursUntilPromise = (promisedAt.getTime() - now.getTime()) / (1000 * 60 * 60);

  const schedule: Array<{ label: string; offsetHours: number; channel: string }> = [];

  // 24h before promise (if promise is more than 24h away)
  if (hoursUntilPromise > 24) {
    schedule.push({
      label: "24h-before",
      offsetHours: hoursUntilPromise - 24,
      channel: "EMAIL_WHATSAPP",
    });
  }

  // Morning of promise day (9 AM IST equivalent)
  schedule.push({
    label: "promise-day",
    offsetHours: Math.max(0, hoursUntilPromise - 2), // ~2h before promised time
    channel: "EMAIL_WHATSAPP",
  });

  // If promise is very soon (< 6h), send immediately
  if (hoursUntilPromise <= 6 && hoursUntilPromise > 0) {
    schedule.push({
      label: "imminent",
      offsetHours: 0,
      channel: "EMAIL_WHATSAPP",
    });
  }

  return schedule;
}

/**
 * Check if a reminder was already sent for a given label.
 */
function wasReminderSent(
  reminders: Array<{ status: string; scheduledAt: Date }>,
  label: string,
): boolean {
  // Simple heuristic: if any reminder was sent in the last 12h, skip
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
  return reminders.some(
    (r) => r.status === "SENT" && r.scheduledAt >= twelveHoursAgo,
  );
}

/**
 * Send a reminder for a specific promise.
 */
async function sendPromiseReminder(
  promise: {
    id: number;
    recoveryCaseId: number;
    promisedAt: Date;
    promisedAmount: number;
    recoveryCase: { invoiceId: number };
  },
  channel: string,
  label: string,
): Promise<PromiseReminderResult> {
  try {
    // Create reminder record
    const reminder = await prisma.promiseReminder.create({
      data: {
        promiseId: promise.id,
        scheduledAt: new Date(),
        channel,
        status: "PENDING",
      },
    });

    // Send via the existing mail service
    const sendResult = await sendInvoiceReminderById({
      invoiceId: promise.recoveryCase.invoiceId,
      reminderType: "OVERDUE_REPEAT",
      daysOverdue: 0,
      channelOverride: channel as "EMAIL" | "WHATSAPP" | "EMAIL_WHATSAPP" | "BOTH",
    });

    if (sendResult.sent) {
      await prisma.promiseReminder.update({
        where: { id: reminder.id },
        data: { status: "SENT", sentAt: new Date() },
      });

      // Log promise event
      await prisma.promiseEvent.create({
        data: {
          promiseId: promise.id,
          eventType: "REMINDER_SENT",
          source: "system",
          note: `Channel: ${channel}, Label: ${label}`,
        },
      });

      return {
        promiseId: promise.id,
        caseId: promise.recoveryCaseId,
        channel,
        status: "SENT",
        reason: `Reminder sent via ${channel} (${label})`,
      };
    }

    await prisma.promiseReminder.update({
      where: { id: reminder.id },
      data: { status: "FAILED" },
    });

    return {
      promiseId: promise.id,
      caseId: promise.recoveryCaseId,
      channel,
      status: "FAILED",
      reason: sendResult.reason,
    };
  } catch (error) {
    return {
      promiseId: promise.id,
      caseId: promise.recoveryCaseId,
      channel,
      status: "FAILED",
      reason: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Main entry point: process all pending promise reminders.
 */
export async function processPromiseReminders(): Promise<{
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  results: PromiseReminderResult[];
}> {
  logInfo("Starting promise reminder processing");

  const promises = await getPromisesNeedingReminders();
  const results: PromiseReminderResult[] = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const promise of promises) {
    const schedule = calculateReminderSchedule(promise.promisedAt);

    for (const slot of schedule) {
      if (wasReminderSent(promise.reminders, slot.label)) {
        skipped++;
        continue;
      }

      const result = await sendPromiseReminder(
        {
          id: promise.id,
          recoveryCaseId: promise.recoveryCaseId,
          promisedAt: promise.promisedAt,
          promisedAmount: Number(promise.promisedAmount),
          recoveryCase: promise.recoveryCase,
        },
        slot.channel,
        slot.label,
      );

      results.push(result);
      if (result.status === "SENT") sent++;
      else if (result.status === "FAILED") failed++;
    }
  }

  logInfo("Promise reminder processing complete", {
    processed: promises.length,
    sent,
    failed,
    skipped,
  });

  return {
    processed: promises.length,
    sent,
    failed,
    skipped,
    results,
  };
}

/**
 * Check for missed promises and escalate them.
 */
export async function processMissedPromises(): Promise<{
  missed: number;
  escalated: number;
}> {
  const now = new Date();

  const missedPromises = await prisma.promiseToPay.findMany({
    where: {
      status: "ACTIVE",
      promisedAt: { lt: now },
    },
    include: {
      recoveryCase: {
        select: { id: true, invoiceId: true, stage: true },
      },
    },
  });

  let escalated = 0;

  for (const promise of missedPromises) {
    // Mark as missed
    await prisma.promiseToPay.update({
      where: { id: promise.id },
      data: { status: "MISSED", missedAt: now },
    });

    // Create missed event
    await prisma.promiseEvent.create({
      data: {
        promiseId: promise.id,
        eventType: "PROMISE_MISSED",
        source: "system",
        note: `Promised: ${promise.promisedAt.toISOString()}, Missed: ${now.toISOString()}`,
        amount: promise.promisedAmount,
      },
    });

    // Escalate the recovery case
    await prisma.recoveryCase.update({
      where: { id: promise.recoveryCaseId },
      data: {
        stage: "ESCALATED",
        status: "OPEN",
      },
    });

    // Create escalation action
    await prisma.agentAction.create({
      data: {
        recoveryCaseId: promise.recoveryCaseId,
        actionType: "ESCALATE_TO_HUMAN",
        channel: "EMAIL",
        urgency: "HIGH",
        reason: `Promise to pay missed: promised ${promise.promisedAmount} by ${promise.promisedAt.toISOString()}`,
        confidence: 1.0,
        policyResult: "ALLOW",
        policyReasons: ["Missed promise auto-escalation"],
        status: "PENDING",
      },
    });

    escalated++;
  }

  return { missed: missedPromises.length, escalated };
}

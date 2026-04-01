import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma, Prisma } from "@/lib/db";
import { getReminderMatchForDate } from "@/lib/reminders";
import { sendInvoiceReminderById } from "@/lib/mail-service";

export const runtime = "nodejs";

function isReminderLogDuplicateError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("invoiceId") &&
    message.includes("reminderKey") &&
    message.includes("Unique constraint failed")
  );
}

function isCronAuthorized(req: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET || process.env.REMINDER_CRON_SECRET;

  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const headerSecret = req.headers.get("x-cron-secret");

  // Security hardening: never trust spoofable headers if no shared secret exists.
  if (!configuredSecret) {
    return false;
  }

  return bearer === configuredSecret || headerSecret === configuredSecret;
}

/** Returns true if a customer qualifies as a long-term regular (≥ 2 years). */
function isLongTermCustomer(
  customer: { isVipExempt: boolean; firstInvoiceAt: Date | null } | null | undefined
): boolean {
  if (!customer) return false;
  if (customer.isVipExempt) return true;
  if (customer.firstInvoiceAt) {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    return customer.firstInvoiceAt <= twoYearsAgo;
  }
  return false;
}

/**
 * manualOverride = true  → called from the UI/dashboard; VIP exemption is bypassed
 * manualOverride = false → called from cron; VIP customers are skipped automatically
 */
async function runAutoReminderSweep(now: Date, limitUserId?: string, manualOverride = false) {
  const invoices = await prisma.invoice.findMany({
    where: {
      ...(limitUserId
        ? {
            OR: [{ ownerUserId: limitUserId }, { userId: limitUserId }],
          }
        : {}),
      autoReminderEnabled: true,
      dueDate: { not: null },
      status: { not: "Paid" },
    },
    select: {
      id: true,
      dueDate: true,
      reminderOffsets: true,
      overdueReminderEnabled: true,
      overdueReminderEveryDays: true,
      ownerUserId: true,
      userId: true,
      customerRel: {
        select: { isVipExempt: true, firstInvoiceAt: true },
      },
    },
  });

  let sentCount = 0;
  let skippedCount = 0;
  let vipSkippedCount = 0;
  let failedCount = 0;
  const failures: Array<{ invoiceId: number; error: string }> = [];

  for (const invoice of invoices) {
    // Skip long-term / VIP customers from automatic sweeps (not from manual sends)
    if (!manualOverride && isLongTermCustomer(invoice.customerRel)) {
      vipSkippedCount += 1;
      continue;
    }

    const match = getReminderMatchForDate({
      dueDate: invoice.dueDate,
      reminderOffsets: (invoice.reminderOffsets as number[]) || [],
      overdueReminderEnabled: invoice.overdueReminderEnabled,
      overdueReminderEveryDays: invoice.overdueReminderEveryDays,
      now,
    });

    if (!match) {
      skippedCount += 1;
      continue;
    }

    const alreadySent = await prisma.invoiceReminderLog.findUnique({
      where: {
        invoiceId_reminderKey: {
          invoiceId: invoice.id,
          reminderKey: match.reminderKey,
        },
      },
      select: { id: true },
    });

    if (alreadySent) {
      skippedCount += 1;
      continue;
    }

    try {
      const result = await sendInvoiceReminderById({
        invoiceId: invoice.id,
        reminderType: match.reminderType,
        daysUntilDue: match.daysUntilDue,
        daysOverdue: match.daysOverdue,
        fallbackUserId: invoice.ownerUserId || invoice.userId || null,
      });

      if (!result.sent) {
        failedCount += 1;
        failures.push({ invoiceId: invoice.id, error: result.reason });
        continue;
      }

      try {
        await prisma.invoiceReminderLog.create({
          data: {
            invoiceId: invoice.id,
            reminderKey: match.reminderKey,
            reminderType: match.reminderType,
            targetDate: match.targetDate,
          },
        });
      } catch (error) {
        if (isReminderLogDuplicateError(error)) {
          skippedCount += 1;
          continue;
        }
        throw error;
      }

      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      failures.push({
        invoiceId: invoice.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    scanned: invoices.length,
    sentCount,
    skippedCount,
    vipSkippedCount,
    failedCount,
    failures: failures.slice(0, 20),
  };
}

export async function GET(req: NextRequest) {
  try {
    const cronAllowed = isCronAuthorized(req);
    let manualUserId: string | undefined;

    if (!cronAllowed) {
      const session = await auth();
      manualUserId = session?.user?.id;
    }

    const manualAllowed = !!manualUserId;

    if (!cronAllowed && !manualAllowed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Cron → scan all, no manualOverride (VIP exemption active)
    // Manual UI trigger → scan user's own invoices, allow overriding VIP exemption
    const limitUserId = cronAllowed ? undefined : manualUserId;
    const manualOverride = !cronAllowed && !!manualUserId;

    const result = await runAutoReminderSweep(new Date(), limitUserId, manualOverride);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Auto reminder run failed:", error);
    return NextResponse.json({ error: "Auto reminder run failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}

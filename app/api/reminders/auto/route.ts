import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/utils/auth";
import { prisma } from "@/app/utils/db";
import { getReminderMatchForDate } from "@/app/utils/invoiceReminders";
import { sendInvoiceReminderById } from "@/app/utils/sendInvoiceReminder";

function isCronAuthorized(req: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET || process.env.REMINDER_CRON_SECRET;
  if (!configuredSecret) return false;

  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const headerSecret = req.headers.get("x-cron-secret");

  return bearer === configuredSecret || headerSecret === configuredSecret;
}

async function runAutoReminderSweep(now: Date) {
  const invoices = await prisma.invoice.findMany({
    where: {
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
    },
  });

  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const failures: Array<{ invoiceId: number; error: string }> = [];

  for (const invoice of invoices) {
    const match = getReminderMatchForDate({
      dueDate: invoice.dueDate,
      reminderOffsets: invoice.reminderOffsets,
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
      });

      if (!result.sent) {
        failedCount += 1;
        failures.push({ invoiceId: invoice.id, error: result.reason });
        continue;
      }

      await prisma.invoiceReminderLog.create({
        data: {
          invoiceId: invoice.id,
          reminderKey: match.reminderKey,
          reminderType: match.reminderType,
          targetDate: match.targetDate,
        },
      });

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
    failedCount,
    failures: failures.slice(0, 20),
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const cronAllowed = isCronAuthorized(req);
    const manualAllowed = !!session?.user?.id;

    if (!cronAllowed && !manualAllowed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runAutoReminderSweep(new Date());
    return NextResponse.json(result);
  } catch (error) {
    console.error("Auto reminder run failed:", error);
    return NextResponse.json({ error: "Auto reminder run failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}

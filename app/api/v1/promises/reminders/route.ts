import { NextRequest, NextResponse } from "next/server";
import { processPromiseReminders, processMissedPromises } from "@/lib/ai/promise-reminder";

/**
 * POST /api/v1/promises/reminders
 *
 * Process pending promise reminders and check for missed promises.
 * Called by cron or manual trigger.
 *
 * Auth: CRON_SECRET header or session.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const reminderSecret = process.env.REMINDER_CRON_SECRET;

  const isValid =
    authHeader === `Bearer ${cronSecret}` ||
    authHeader === `Bearer ${reminderSecret}`;

  if (!isValid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Process pending reminders
    const reminderResult = await processPromiseReminders();

    // Check for missed promises
    const missedResult = await processMissedPromises();

    return NextResponse.json({
      ok: true,
      reminders: reminderResult,
      missed: missedResult,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Promise reminder processing failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/v1/promises/reminders
 *
 * Get summary of promise reminder status.
 */
export async function GET() {
  const { prisma } = await import("@/lib/db");

  const [totalPromises, activePromises, missedPromises, fulfilledPromises, totalReminders] =
    await Promise.all([
      prisma.promiseToPay.count(),
      prisma.promiseToPay.count({ where: { status: "ACTIVE" } }),
      prisma.promiseToPay.count({ where: { status: "MISSED" } }),
      prisma.promiseToPay.count({ where: { status: "FULFILLED" } }),
      prisma.promiseReminder.count(),
    ]);

  const sentReminders = await prisma.promiseReminder.count({
    where: { status: "SENT" },
  });

  return NextResponse.json({
    promises: {
      total: totalPromises,
      active: activePromises,
      missed: missedPromises,
      fulfilled: fulfilledPromises,
    },
    reminders: {
      total: totalReminders,
      sent: sentReminders,
    },
  });
}

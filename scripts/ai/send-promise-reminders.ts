/**
 * Promise reminder cron script.
 *
 * Run every 6 hours to check for:
 * 1. Active promises that need reminders (24h before, day-of, etc.)
 * 2. Missed promises that need escalation
 *
 * Usage: npx tsx scripts/ai/send-promise-reminders.ts
 *
 * Add to vercel.json cron or GitHub Actions:
 *   curl -X POST https://invonotify.vercel.app/api/v1/promises/reminders \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */

const API_URL =
  process.env.APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000";

const CRON_SECRET = process.env.CRON_SECRET || process.env.REMINDER_CRON_SECRET;

async function main() {
  console.log("[promise-reminders] Starting...");

  if (!CRON_SECRET) {
    console.error("[promise-reminders] CRON_SECRET not set, aborting");
    process.exit(1);
  }

  try {
    const response = await fetch(`${API_URL}/api/v1/promises/reminders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CRON_SECRET}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[promise-reminders] Failed:", data);
      process.exit(1);
    }

    console.log("[promise-reminders] Results:");
    console.log(`  Reminders processed: ${data.reminders.processed}`);
    console.log(`  Sent: ${data.reminders.sent}`);
    console.log(`  Failed: ${data.reminders.failed}`);
    console.log(`  Skipped: ${data.reminders.skipped}`);
    console.log(`  Missed promises: ${data.missed.missed}`);
    console.log(`  Escalated: ${data.missed.escalated}`);

    // Print individual results
    if (data.reminders.results?.length > 0) {
      console.log("\n  Detail:");
      for (const r of data.reminders.results) {
        console.log(
          `    Case #${r.caseId} | Promise #${r.promiseId} | ${r.channel} | ${r.status} | ${r.reason}`,
        );
      }
    }
  } catch (error) {
    console.error("[promise-reminders] Error:", error);
    process.exit(1);
  }
}

main();

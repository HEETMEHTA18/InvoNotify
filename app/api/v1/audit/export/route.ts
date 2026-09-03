import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/v1/audit/export
 *
 * Export audit logs as CSV or JSON for compliance reporting.
 * Query params:
 *   format  - "csv" (default) or "json"
 *   days    - number of days to look back (default: 30)
 *   actor   - filter by actor
 *   eventType - filter by event type
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "csv";
  const days = Math.min(365, Math.max(1, parseInt(searchParams.get("days") || "30", 10)));
  const actor = searchParams.get("actor") || undefined;
  const eventType = searchParams.get("eventType") || undefined;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const where: Record<string, unknown> = { createdAt: { gte: since } };
  if (actor) where.actor = actor;
  if (eventType) where.eventType = eventType;

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 10000,
    include: {
      recoveryCase: {
        select: { id: true, invoiceId: true },
      },
    },
  });

  if (format === "json") {
    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      count: logs.length,
      filters: { days, actor, eventType },
      logs: logs.map((log) => ({
        id: log.id,
        recoveryCaseId: log.recoveryCaseId,
        invoiceId: log.recoveryCase?.invoiceId ?? null,
        eventType: log.eventType,
        actor: log.actor,
        before: log.before,
        after: log.after,
        metadata: log.metadata,
        createdAt: log.createdAt.toISOString(),
      })),
    });
  }

  // CSV format
  const headers = [
    "id",
    "recovery_case_id",
    "invoice_id",
    "event_type",
    "actor",
    "before",
    "after",
    "metadata",
    "created_at",
  ];

  const escapeCsv = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const str = typeof value === "object" ? JSON.stringify(value) : String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = logs.map((log) => [
    escapeCsv(log.id),
    escapeCsv(log.recoveryCaseId),
    escapeCsv(log.recoveryCase?.invoiceId ?? ""),
    escapeCsv(log.eventType),
    escapeCsv(log.actor),
    escapeCsv(log.before),
    escapeCsv(log.after),
    escapeCsv(log.metadata),
    escapeCsv(log.createdAt.toISOString()),
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

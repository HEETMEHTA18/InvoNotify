import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/utils/db";

type RevenueBucketRow = {
    bucket_start: Date;
    revenue: Prisma.Decimal | number | string | null;
};

type HighRiskGroupRow = {
    clientName: string | null;
    clientEmail: string | null;
    invoice_count: number | bigint;
    total_overdue: Prisma.Decimal | number | string | null;
};

function numericValue(
    value: Prisma.Decimal | number | string | null | undefined
): number {
    return Number(value ?? 0);
}

function invoiceAmount(
    total: Prisma.Decimal | number | string | null | undefined,
    amount: Prisma.Decimal | number | string | null | undefined
): number {
    const totalValue = numericValue(total);
    if (totalValue !== 0) return totalValue;
    return numericValue(amount);
}

async function getRevenueBuckets(
    bucket: "hour" | "day" | "month",
    startDate: Date
): Promise<RevenueBucketRow[]> {
    return prisma.$queryRaw<RevenueBucketRow[]>`
        WITH paid_invoices AS (
            SELECT i.id,
                   COALESCE(lp.last_payment_date, i."updatedAt") AS paid_at,
                   CASE
                     WHEN COALESCE(i."total", 0) = 0 THEN COALESCE(i."amount", 0)
                     ELSE i."total"
                   END AS revenue
            FROM "Invoice" i
            LEFT JOIN (
                SELECT "invoiceId", MAX("date") AS last_payment_date
                FROM "Payment"
                GROUP BY "invoiceId"
            ) lp ON lp."invoiceId" = i.id
            WHERE i."status" = 'Paid'
        )
        SELECT date_trunc(${bucket}::text, paid_at) AS bucket_start,
               SUM(revenue) AS revenue
        FROM paid_invoices
        WHERE paid_at >= ${startDate}
        GROUP BY bucket_start
        ORDER BY bucket_start ASC
    `;
}

export async function GET(req: NextRequest) {
    try {
        const now = new Date();
        const revenueRangeRaw = req.nextUrl.searchParams.get("revenueRange");
        const revenueRange: "day" | "week" | "month" =
            revenueRangeRaw === "day" || revenueRangeRaw === "week" || revenueRangeRaw === "month"
                ? revenueRangeRaw
                : "month";

        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const weekStart = new Date(todayStart);
        weekStart.setDate(weekStart.getDate() - 6);
        const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

        const [
            paidStats,
            pendingStats,
            overdueStats,
            totalInvoices,
            recentInvoicesRaw,
            rawStatusCounts,
            overdueStatusCounts,
            highRiskGroups,
        ] = await Promise.all([
            prisma.invoice.aggregate({
                where: { status: "Paid" },
                _sum: { total: true, amount: true },
            }),
            prisma.invoice.aggregate({
                where: { status: { in: ["Pending", "Draft"] } },
                _sum: { total: true, amount: true },
            }),
            prisma.invoice.aggregate({
                where: {
                    status: { in: ["Pending", "Draft"] },
                    dueDate: { lt: now },
                },
                _sum: { total: true, amount: true },
            }),
            prisma.invoice.count(),
            prisma.invoice.findMany({
                take: 5,
                orderBy: { date: "desc" },
                select: {
                    id: true,
                    clientName: true,
                    amount: true,
                    total: true,
                    status: true,
                    date: true,
                    dueDate: true,
                    invoiceNumber: true,
                },
            }),
            prisma.invoice.groupBy({
                by: ["status"],
                _count: { _all: true },
            }),
            prisma.invoice.groupBy({
                by: ["status"],
                where: {
                    status: { in: ["Pending", "Draft"] },
                    dueDate: { lt: now },
                },
                _count: { _all: true },
            }),
            prisma.$queryRaw<HighRiskGroupRow[]>`
                SELECT "clientName",
                       "clientEmail",
                       COUNT(*)::int AS invoice_count,
                       SUM(
                         CASE
                           WHEN COALESCE("total", 0) = 0 THEN COALESCE("amount", 0)
                           ELSE "total"
                         END
                       ) AS total_overdue
                FROM "Invoice"
                WHERE "status" IN ('Pending', 'Draft')
                  AND "dueDate" < ${now}
                GROUP BY "clientName", "clientEmail"
                ORDER BY total_overdue DESC
                LIMIT 10
            `,
        ]);

        const highRiskCustomers = await Promise.all(
            highRiskGroups.map(async (group) => {
                const latestInvoice = await prisma.invoice.findFirst({
                    where: {
                        status: { in: ["Pending", "Draft"] },
                        dueDate: { lt: now },
                        clientName: group.clientName ?? "",
                        clientEmail: group.clientEmail ?? "",
                    },
                    orderBy: { date: "desc" },
                    select: { id: true, date: true },
                });

                return {
                    name: group.clientName || "Unknown",
                    email: group.clientEmail || "",
                    totalOverdue: numericValue(group.total_overdue),
                    count: Number(group.invoice_count),
                    lastInvoiceDate: latestInvoice?.date ?? null,
                    lastInvoiceId: latestInvoice?.id ?? null,
                };
            })
        );

        const recentActivity = recentInvoicesRaw.map((inv) => {
            let status = inv.status;
            if (status !== "Paid" && inv.dueDate && new Date(inv.dueDate) < now) {
                status = "Overdue";
            }

            return {
                id: inv.id,
                clientName: inv.clientName,
                amount: inv.amount,
                total: inv.total,
                status,
                date: inv.date,
                invoiceNumber: inv.invoiceNumber,
            };
        });

        const statusMap = new Map<string, number>();
        for (const row of rawStatusCounts) {
            statusMap.set(row.status, row._count._all);
        }

        let overdueTotal = 0;
        for (const row of overdueStatusCounts) {
            const current = statusMap.get(row.status) ?? 0;
            statusMap.set(row.status, Math.max(0, current - row._count._all));
            overdueTotal += row._count._all;
        }
        if (overdueTotal > 0) {
            statusMap.set("Overdue", overdueTotal);
        }

        const statusDistribution = Array.from(statusMap.entries())
            .filter(([, value]) => value > 0)
            .map(([name, value]) => ({ name, value }));

        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const revenueMap = new Map<string, number>();
        const formatDayLabel = (date: Date) => `${months[date.getMonth()]} ${date.getDate()}`;

        let revenueRows: RevenueBucketRow[] = [];
        if (revenueRange === "day") {
            for (let hour = 0; hour < 24; hour += 1) {
                revenueMap.set(`${String(hour).padStart(2, "0")}:00`, 0);
            }

            revenueRows = await getRevenueBuckets("hour", todayStart);
        } else if (revenueRange === "week") {
            for (let i = 0; i < 7; i += 1) {
                const day = new Date(weekStart);
                day.setDate(weekStart.getDate() + i);
                revenueMap.set(formatDayLabel(day), 0);
            }

            revenueRows = await getRevenueBuckets("day", weekStart);
        } else {
            for (let i = 11; i >= 0; i -= 1) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const label = `${months[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
                revenueMap.set(label, 0);
            }

            revenueRows = await getRevenueBuckets("month", twelveMonthsAgo);
        }

        for (const row of revenueRows) {
            const bucketDate = new Date(row.bucket_start);
            const label =
                revenueRange === "day"
                    ? `${String(bucketDate.getHours()).padStart(2, "0")}:00`
                    : revenueRange === "week"
                        ? formatDayLabel(bucketDate)
                        : `${months[bucketDate.getMonth()]} ${String(bucketDate.getFullYear()).slice(-2)}`;
            if (revenueMap.has(label)) {
                revenueMap.set(label, Number(row.revenue ?? 0));
            }
        }

        const monthlyRevenue = Array.from(revenueMap.entries()).map(([month, revenue]) => ({
            month,
            revenue,
        }));

        return NextResponse.json(
            {
                kpi: {
                    totalRevenue: invoiceAmount(paidStats._sum.total, paidStats._sum.amount),
                    pendingAmount: invoiceAmount(pendingStats._sum.total, pendingStats._sum.amount),
                    overdueAmount: invoiceAmount(overdueStats._sum.total, overdueStats._sum.amount),
                    totalInvoices,
                    highRiskCount: highRiskCustomers.length,
                },
                highRiskCustomers,
                recentActivity,
                monthlyRevenue,
                statusDistribution,
                revenueRange,
            },
            {
                headers: {
                    "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
                },
            }
        );
    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        return NextResponse.json({ error: "Failed to fetch dashboard stats" }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma, isPrismaDbConnectionError } from "@/lib/db";
import { auth } from "@/lib/auth";

// Helper to get a numeric invoice amount
function invoiceAmount(total: Prisma.Decimal | number | string | null | undefined, amount: Prisma.Decimal | number | string | null | undefined): number {
    const numericValue = (value: Prisma.Decimal | number | string | null | undefined) => Number(value ?? 0);
    const totalValue = numericValue(total);
    if (totalValue !== 0) return totalValue;
    return numericValue(amount);
}
// Helper function for revenue buckets
async function getRevenueBuckets(
    bucket: "hour" | "day" | "month",
    startDate: Date,
    userId: string
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
              AND i."userId" = ${userId}
        )
        SELECT date_trunc(${bucket}::text, paid_at) AS bucket_start,
               SUM(revenue) AS revenue
        FROM paid_invoices
        WHERE paid_at >= ${startDate}
        GROUP BY bucket_start
        ORDER BY bucket_start ASC
    `;
}

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

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
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

        // Fail fast when DB is unreachable instead of triggering many concurrent query failures.
        await prisma.$queryRaw`SELECT 1`;

        const [
            aggregations,
            paidStats,
            pendingStats,
            overdueStats,
            recentInvoicesRaw,
            rawStatusCounts,
            overdueStatusCounts,
            highRiskGroups,
        ] = await Promise.all([
            prisma.invoice.aggregate({
                where: { userId },
                _count: { _all: true },
            }),
            prisma.invoice.aggregate({
                where: { status: "Paid", userId },
                _sum: { total: true, amount: true },
            }),
            prisma.invoice.aggregate({
                where: { status: { in: ["Pending", "Draft"] }, userId },
                _sum: { total: true, amount: true },
            }),
            prisma.invoice.aggregate({
                where: {
                    status: { in: ["Pending", "Draft"] },
                    dueDate: { lt: now },
                    userId,
                },
                _sum: { total: true, amount: true },
            }),
            prisma.invoice.findMany({
                where: { userId },
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
                where: { userId },
                _count: { _all: true },
            }),
            prisma.invoice.groupBy({
                by: ["status"],
                where: {
                    status: { in: ["Pending", "Draft"] },
                    dueDate: { lt: now },
                    userId,
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
                  AND "userId" = ${userId}
                GROUP BY "clientName", "clientEmail"
                ORDER BY total_overdue DESC
                LIMIT 10
            `,
        ]);

        // Calculate status distribution using pre-fetched data
        const statusDistributionMap = new Map<string, number>();
        ["Paid", "Pending", "Draft", "Overdue", "Cancelled"].forEach(s => statusDistributionMap.set(s, 0));

        let overdueTotalCount = 0;
        for (const row of overdueStatusCounts) {
            overdueTotalCount += row._count._all;
        }
        statusDistributionMap.set("Overdue", overdueTotalCount);

        for (const row of rawStatusCounts) {
            const count = row._count._all;
            const status = row.status;

            if (status === "Paid" || status === "Cancelled") {
                statusDistributionMap.set(status, count);
            } else if (status === "Pending" || status === "Draft") {
                // Subtract overdue count from Pending/Draft to avoid double counting
                const overdueForStatus = (overdueStatusCounts as any[]).find((osc: any) => osc.status === status)?._count._all ?? 0;
                statusDistributionMap.set(status, Math.max(0, count - overdueForStatus));
            }
        }

        const statusDistribution = Array.from(statusDistributionMap.entries())
            .filter(([_, value]) => value > 0)
            .map(([name, value]) => ({ name, value }));

        // Efficiently fetch high risk customers using a single batch query for latest invoices
        const highRiskCustomersData = highRiskGroups as HighRiskGroupRow[];
        const customerIdentifiers = highRiskCustomersData.map(g => ({
            name: g.clientName || "",
            email: g.clientEmail || ""
        })).filter(c => c.name !== "" || c.email !== "");

        // Find latest invoices for all high-risk clients at once to avoid N+1 problem
        const latestInvoices = await prisma.invoice.findMany({
            where: {
                userId,
                status: { in: ["Pending", "Draft"] },
                dueDate: { lt: now },
                OR: customerIdentifiers.map(c => ({
                    clientName: c.name,
                    clientEmail: c.email
                }))
            },
            orderBy: { date: "desc" },
            distinct: ["clientName", "clientEmail"],
            select: { id: true, date: true, clientName: true, clientEmail: true },
        });

        const highRiskCustomers = highRiskCustomersData.map(group => {
            const latest = latestInvoices.find(li => 
                li.clientName === group.clientName && li.clientEmail === group.clientEmail
            );
            return {
                name: group.clientName || "Unknown",
                email: group.clientEmail || "",
                totalOverdue: Number(group.total_overdue ?? 0),
                count: Number(group.invoice_count),
                lastInvoiceDate: latest?.date ?? null,
                lastInvoiceId: latest?.id ?? null,
            };
        });

        const recentActivity = (recentInvoicesRaw as any[]).map((inv: any) => {
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


        // Revenue chart logic
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const revenueMap = new Map<string, number>();
        const formatDayLabel = (date: Date) => `${months[date.getMonth()]} ${date.getDate()}`;
        let revenueRows: RevenueBucketRow[] = [];
        if (revenueRange === "day") {
            for (let hour = 0; hour < 24; hour += 1) {
                revenueMap.set(`${String(hour).padStart(2, "0")}:00`, 0);
            }
            revenueRows = await getRevenueBuckets("hour", todayStart, userId);
        } else if (revenueRange === "week") {
            for (let i = 0; i < 7; i += 1) {
                const day = new Date(weekStart);
                day.setDate(weekStart.getDate() + i);
                revenueMap.set(formatDayLabel(day), 0);
            }
            revenueRows = await getRevenueBuckets("day", weekStart, userId);
        } else {
            for (let i = 11; i >= 0; i -= 1) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const label = `${months[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
                revenueMap.set(label, 0);
            }
            revenueRows = await getRevenueBuckets("month", twelveMonthsAgo, userId);
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
                    totalRevenue: invoiceAmount(paidStats._sum?.total, paidStats._sum?.amount),
                    pendingAmount: invoiceAmount(pendingStats._sum?.total, pendingStats._sum?.amount),
                    overdueAmount: invoiceAmount(overdueStats._sum?.total, overdueStats._sum?.amount),
                    totalInvoices: aggregations._count?._all ?? 0,
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
        if (isPrismaDbConnectionError(error)) {
            return NextResponse.json(
                { error: "Database is temporarily unavailable. Please try again shortly." },
                { status: 503 }
            );
        }
        return NextResponse.json({ error: "Failed to fetch dashboard stats" }, { status: 500 });
    }
}

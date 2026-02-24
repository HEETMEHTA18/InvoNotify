import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/utils/db";
import { auth } from "@/app/utils/auth";

export async function GET(req: NextRequest) {
    // Get current user session
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    try {
        // 1. Fetch KPI aggregations (filtered by userId)
        const aggregations = await prisma.invoice.aggregate({
            where: { userId: userId },
            _sum: {
                total: true,
                amount: true,
            },
            _count: {
                _all: true,
            },
        });

        const paidStats = await prisma.invoice.aggregate({
            where: { status: "Paid", userId: userId },
            _sum: {
                total: true,
                amount: true,
            },
        });

        const pendingStats = await prisma.invoice.aggregate({
            where: {
                status: { in: ["Pending", "Draft"] },
                userId: userId
            },
            _sum: {
                total: true,
                amount: true,
            },
        });

        // For overdue and high risk, we still need some processing or specific queries
        const now = new Date();
        const overdueStats = await prisma.invoice.aggregate({
            where: {
                status: { in: ["Pending", "Draft"] },
                dueDate: { lt: now },
                userId
            },
            _sum: {
                total: true,
                amount: true,
            }
        });

        const totalRevenue = Number(paidStats._sum.total || paidStats._sum.amount || 0);
        const pendingAmount = Number(pendingStats._sum.total || pendingStats._sum.amount || 0);
        const overdueAmount = Number(overdueStats._sum.total || overdueStats._sum.amount || 0);
        const totalInvoices = aggregations._count._all;

        // For High Risk Customers, we can use groupBy
        const highRiskMap = new Map<string, {
            name: string;
            email: string;
            totalOverdue: number;
            count: number;
            lastInvoiceDate: Date | null;
            lastInvoiceId: number | null;
        }>();

        // To calculate high risk customers, we need to fetch all relevant invoices
        // and then process them manually to track lastInvoiceId.
        // This is a more complex operation than simple aggregation.
        const invoices = await prisma.invoice.findMany({
            where: {
                status: { in: ["Pending", "Draft"] },
                dueDate: { lt: now },
                userId
            },
            select: {
                id: true,
                clientName: true,
                clientEmail: true,
                amount: true,
                total: true,
                status: true,
                date: true,
                dueDate: true,
            }
        });

        const getAmount = (invoice: { total: any; amount: any; }) =>
            Number(invoice.total || invoice.amount || 0);

        // 3. Process invoices to identify high-risk customers
        for (const inv of invoices) {
            const amt = getAmount(inv);

            // Check for Overdue (already filtered by query, but good for clarity)
            let isOverdue = false;
            if (inv.status !== "Paid" && inv.dueDate) {
                const due = new Date(inv.dueDate);
                if (due < now) {
                    isOverdue = true;
                }
            }

            if (isOverdue) {
                // Track High Risk Customer
                const key = inv.clientEmail || inv.clientName || "Unknown";
                if (!highRiskMap.has(key)) {
                    highRiskMap.set(key, {
                        name: inv.clientName || "Unknown",
                        email: inv.clientEmail || "",
                        totalOverdue: 0,
                        count: 0,
                        lastInvoiceDate: null,
                        lastInvoiceId: null
                    });
                }
                const riskProfile = highRiskMap.get(key)!;
                riskProfile.totalOverdue += amt;
                riskProfile.count += 1;

                const invDate = inv.date ? new Date(inv.date) : null;
                if (invDate && (!riskProfile.lastInvoiceDate || invDate > riskProfile.lastInvoiceDate)) {
                    riskProfile.lastInvoiceDate = invDate;
                    riskProfile.lastInvoiceId = inv.id;
                }
            }
        }

        // Convert map to array and sort for top 10
        const highRiskCustomers = Array.from(highRiskMap.values())
            .sort((a, b) => b.totalOverdue - a.totalOverdue)
            .slice(0, 10);

        // 5. Recent Activity (Last 5 Invoices)
        const recentActivity = await prisma.invoice.findMany({
            where: { userId },
            take: 5,
            orderBy: { date: 'desc' },
            select: {
                id: true,
                clientName: true,
                amount: true,
                total: true,
                status: true,
                date: true,
                invoiceNumber: true
            }
        });

        // 6. Chart Data: Monthly Revenue (Last 6 Months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        sixMonthsAgo.setDate(1); // Start of the month

        const revenueByMonth = await prisma.invoice.groupBy({
            by: ['date', 'status', 'total', 'amount'],
            where: {
                date: { gte: sixMonthsAgo },
                status: "Paid",
                userId
            }
        });

        // Manual aggregation for monthly bars as prisma groupBy on dates is limited in some versions
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const monthlyRevenueMap = new Map<string, number>();

        // Pre-fill last 6 months
        for (let i = 0; i < 6; i++) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const label = `${months[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
            monthlyRevenueMap.set(label, 0);
        }

        revenueByMonth.forEach(inv => {
            if (inv.date) {
                const d = new Date(inv.date);
                const label = `${months[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
                if (monthlyRevenueMap.has(label)) {
                    monthlyRevenueMap.set(label, monthlyRevenueMap.get(label)! + Number(inv.total || inv.amount || 0));
                }
            }
        });

        const monthlyRevenue = Array.from(monthlyRevenueMap.entries())
            .map(([month, revenue]) => ({ month, revenue }))
            .reverse();

        // 7. Chart Data: Status Distribution
        const statusDistributionRaw = await prisma.invoice.groupBy({
            by: ['status'],
            where: { userId },
            _count: { _all: true }
        });

        const statusDistribution = statusDistributionRaw.map(item => ({
            name: item.status,
            value: item._count._all
        }));

        return NextResponse.json({
            kpi: {
                totalRevenue,
                pendingAmount,
                overdueAmount,
                totalInvoices,
                highRiskCount: highRiskCustomers.length
            },
            highRiskCustomers,
            recentActivity,
            monthlyRevenue,
            statusDistribution
        });

    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        return NextResponse.json({ error: "Failed to fetch dashboard stats" }, { status: 500 });
    }
}

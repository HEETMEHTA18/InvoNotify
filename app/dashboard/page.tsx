"use client";
import { useEffect, useState } from "react";
import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { RiskTable } from "@/components/dashboard/RiskTable";
import { AnalyticsCharts } from "@/components/dashboard/AnalyticsCharts";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type RevenueRange = "day" | "week" | "month";
const DASHBOARD_CACHE_KEY = "dashboard:stats:v1";

interface DashboardData {
  kpi: {
    totalRevenue: number;
    pendingAmount: number;
    overdueAmount: number;
    totalInvoices: number;
    highRiskCount: number;
  };
  highRiskCustomers: Array<{
    name: string;
    email: string;
    totalOverdue: number;
    count: number;
    lastInvoiceDate: Date | null;
    lastInvoiceId: number | null;
  }>;
  recentActivity: Array<{
    id: number;
    clientName: string;
    amount: number | null;
    total: number | null;
    status: string;
    date: Date;
    invoiceNumber: string;
  }>;
  monthlyRevenue: Array<{
    month: string;
    revenue: number;
  }>;
  statusDistribution: Array<{
    name: string;
    value: number;
  }>;
  revenueRange?: RevenueRange;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [revenueRange, setRevenueRange] = useState<RevenueRange>("month");

  const fetchDashboardData = async (
    range: RevenueRange = revenueRange,
    options?: { background?: boolean },
  ) => {
    const background = options?.background ?? false;
    try {
      if (!background) {
        setLoading(true);
      }
      setError("");
      const res = await fetch(`/api/dashboard/stats?revenueRange=${range}`);
      if (!res.ok) throw new Error("Failed to fetch dashboard data");
      const json = await res.json();
      setData(json);
      setRevenueRange((json.revenueRange as RevenueRange) || range);

      try {
        sessionStorage.setItem(
          DASHBOARD_CACHE_KEY,
          JSON.stringify({
            data: json,
            revenueRange: (json.revenueRange as RevenueRange) || range,
            cachedAt: Date.now(),
          }),
        );
      } catch {
        // Ignore cache persistence errors (e.g., private mode/storage restrictions)
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load dashboard data. Please try again.");
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  };

  const handleRevenueRangeChange = (range: RevenueRange) => {
    if (range === revenueRange) return;
    setRevenueRange(range);
    fetchDashboardData(range);
  };

  useEffect(() => {
    let cachedRange: RevenueRange = "month";
    let hasCachedData = false;

    try {
      const raw = sessionStorage.getItem(DASHBOARD_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as {
          data?: DashboardData;
          revenueRange?: RevenueRange;
          cachedAt?: number;
        };

        if (cached?.data) {
          hasCachedData = true;
          cachedRange = cached.revenueRange || "month";
          setData(cached.data);
          setRevenueRange(cachedRange);
          setLoading(false);
        }
      }
    } catch {
      // Ignore malformed cache
    }

    fetchDashboardData(hasCachedData ? cachedRange : "month", {
      background: hasCachedData,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Overview of your business performance and risk analysis
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchDashboardData(revenueRange)}
          disabled={loading}
          className="gap-2"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm mb-6">
          {error}
        </div>
      ) : loading && !data ? (
        <>
          {/* KPI Skeleton Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <Skeleton className="h-3 w-24 mb-3" />
                    <Skeleton className="h-7 w-32" />
                  </div>
                  <Skeleton className="h-10 w-10 rounded-lg" />
                </div>
              </div>
            ))}
          </div>

          {/* Charts Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <Skeleton className="h-5 w-36 mb-4" />
              <Skeleton className="h-55 w-full rounded-lg" />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <Skeleton className="h-5 w-28 mb-4" />
              <Skeleton
                className="h-55 w-full rounded-full mx-auto"
                style={{ maxWidth: 220 }}
              />
            </div>
          </div>

          {/* Risk Table + Recent Activity Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <div className="divide-y divide-gray-100">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="px-6 py-4 flex items-center justify-between"
                  >
                    <div>
                      <Skeleton className="h-4 w-36 mb-2" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-8 w-16 rounded-lg" />
                      <Skeleton className="h-8 w-14 rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <Skeleton className="h-4 w-32 mb-4" />
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                  >
                    <div>
                      <Skeleton className="h-4 w-28 mb-1.5" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <div className="text-right">
                      <Skeleton className="h-4 w-16 mb-1.5 ml-auto" />
                      <Skeleton className="h-4 w-12 rounded ml-auto" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Key Performance Indicators */}
          <DashboardStats stats={data?.kpi} />

          {/* Visual Analytics */}
          <AnalyticsCharts
            revenueData={data?.monthlyRevenue || []}
            statusData={data?.statusDistribution || []}
            revenueRange={revenueRange}
            onRevenueRangeChange={handleRevenueRangeChange}
            isRevenueLoading={loading}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Risk Analysis Table (Main Content) */}
            <div className="lg:col-span-2">
              <RiskTable customers={data?.highRiskCustomers || []} />
            </div>

            {/* Recent Activity (Side Panel) */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wide">
                Recent Activity
              </h3>
              <div className="space-y-4">
                {data?.recentActivity?.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">
                    No recent activity.
                  </p>
                ) : (
                  data?.recentActivity?.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 rounded-lg px-2 -mx-2 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {inv.clientName || "Unknown Client"}
                        </p>
                        <p className="text-xs text-gray-500">
                          #{inv.invoiceNumber} •{" "}
                          {new Date(inv.date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">
                          ₹
                          {Number(
                            inv.total || inv.amount || 0,
                          ).toLocaleString()}
                        </p>
                        <span
                          className={`inline-flex px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide
                          ${
                            inv.status === "Paid"
                              ? "bg-green-100 text-green-700"
                              : inv.status === "Overdue"
                                ? "bg-red-100 text-red-700"
                                : inv.status === "Pending"
                                  ? "bg-blue-100 text-blue-700"
                                  : inv.status === "Draft"
                                    ? "bg-gray-100 text-gray-700"
                                    : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

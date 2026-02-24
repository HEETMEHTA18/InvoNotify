"use client";

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from "recharts";

type RevenueRange = "day" | "week" | "month";

interface AnalyticsChartsProps {
    revenueData: { month: string; revenue: number }[];
    statusData: { name: string; value: number }[];
    revenueRange: RevenueRange;
    onRevenueRangeChange: (range: RevenueRange) => void;
    isRevenueLoading?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
    "Paid": "#10B981",      // Green
    "Pending": "#3B82F6",   // Blue
    "Draft": "#6B7280",     // Gray
    "Overdue": "#EF4444",   // Red
    "Cancelled": "#F59E0B", // Orange
};

const getStatusColor = (status: string, index: number) => {
    return STATUS_COLORS[status] || `hsl(${index * 60}, 70%, 50%)`;
};

const REVENUE_TITLES: Record<RevenueRange, string> = {
    day: "Revenue Trend (Today)",
    week: "Revenue Trend (Last 7 Days)",
    month: "Revenue Trend (Last 12 Months)",
};

const REVENUE_RANGE_OPTIONS: Array<{ label: string; value: RevenueRange }> = [
    { label: "Day", value: "day" },
    { label: "Week", value: "week" },
    { label: "Month", value: "month" },
];

type StatusTooltipProps = {
    active?: boolean;
    payload?: Array<{ name?: string; value?: number | string }>;
    total: number;
};

function StatusTooltip({
    active,
    payload,
    total,
}: StatusTooltipProps) {
    if (!active || !payload || !payload.length) return null;

    const row = payload[0];
    const value = Number(row.value || 0);
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;

    return (
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md">
            <p className="text-xs font-semibold text-gray-900">{row.name}</p>
            <p className="text-xs text-gray-600">
                {value} invoice{value === 1 ? "" : "s"} ({pct}%)
            </p>
        </div>
    );
}

export function AnalyticsCharts({
    revenueData,
    statusData,
    revenueRange,
    onRevenueRangeChange,
    isRevenueLoading = false,
}: AnalyticsChartsProps) {
    const totalStatusCount = statusData.reduce((sum, row) => sum + Number(row.value || 0), 0);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Revenue Trend Chart */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-6">
                    <h1 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                        {REVENUE_TITLES[revenueRange]}
                    </h1>
                    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
                        {REVENUE_RANGE_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => onRevenueRangeChange(option.value)}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${revenueRange === option.value
                                        ? "bg-gray-900 text-white"
                                        : "text-gray-600 hover:bg-white hover:text-gray-900"
                                    }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
                {revenueData && revenueData.length > 0 && revenueData.some(d => d.revenue > 0) ? (
                    <div className="relative h-[300px] w-full">
                        {isRevenueLoading && (
                            <div className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-white/70">
                                <div className="h-6 w-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
                            </div>
                        )}
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={revenueData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                    dataKey="month"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 12, fill: '#6B7280' }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 12, fill: '#6B7280' }}
                                    tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}K`}
                                />
                                <Tooltip
                                    cursor={{ fill: '#F9FAFB' }}
                                    contentStyle={{
                                        borderRadius: '12px',
                                        border: 'none',
                                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                        padding: '12px'
                                    }}
                                    formatter={(value) => [`₹${Number(value).toLocaleString()}`, 'Revenue']}
                                />
                                <Bar dataKey="revenue" fill="#111827" radius={[6, 6, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="h-[300px] w-full flex items-center justify-center">
                        <div className="text-center">
                            <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                            </div>
                            <p className="text-gray-500 text-sm font-medium">No revenue data yet</p>
                            <p className="text-gray-400 text-xs mt-1">Mark invoices as paid to see revenue trends</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Invoice Status Distribution */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-6">
                    <h1 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                        Invoice Status Distribution
                    </h1>
                </div>
                {statusData && statusData.length > 0 ? (
                    <div className="space-y-4">
                        <div className="relative h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={statusData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={66}
                                        outerRadius={100}
                                        paddingAngle={3}
                                        cornerRadius={7}
                                        dataKey="value"
                                        label={false}
                                        labelLine={false}
                                    >
                                        {statusData.map((entry, index) => (
                                            <Cell
                                                key={`cell-${entry.name}-${index}`}
                                                fill={getStatusColor(entry.name, index)}
                                                stroke="white"
                                                strokeWidth={2}
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        content={(props) => (
                                            <StatusTooltip
                                                active={props.active}
                                                payload={props.payload as Array<{ name?: string; value?: number | string }>}
                                                total={totalStatusCount}
                                            />
                                        )}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="pointer-events-none absolute inset-0 grid place-items-center">
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-gray-900">{totalStatusCount}</p>
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                                        Invoices
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {statusData.map((entry, index) => {
                                const value = Number(entry.value || 0);
                                const pct = totalStatusCount > 0 ? Math.round((value / totalStatusCount) * 100) : 0;
                                return (
                                    <div
                                        key={`${entry.name}-legend`}
                                        className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span
                                                className="inline-block h-2.5 w-2.5 rounded-full"
                                                style={{ backgroundColor: getStatusColor(entry.name, index) }}
                                            />
                                            <span className="text-xs font-medium text-gray-700">{entry.name}</span>
                                        </div>
                                        <span className="text-xs font-semibold text-gray-900">
                                            {value} ({pct}%)
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="h-[300px] w-full flex items-center justify-center">
                        <div className="text-center">
                            <p className="text-gray-500 text-sm">No invoice data available</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

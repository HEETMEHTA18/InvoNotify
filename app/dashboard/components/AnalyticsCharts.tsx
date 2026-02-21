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
    Legend,
} from "recharts";

interface AnalyticsChartsProps {
    revenueData: { month: string; revenue: number }[];
    statusData: { name: string; value: number }[];
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

export function AnalyticsCharts({ revenueData, statusData }: AnalyticsChartsProps) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Revenue Trend Chart */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h1 className="text-sm font-semibold text-gray-900 mb-6 uppercase tracking-wide">
                    Revenue Trend (Last 6 Months)
                </h1>
                <div className="h-[300px] w-full">
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
                                tickFormatter={(value) => `₹${value}`}
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
            </div>

            {/* Invoice Status Distribution */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h1 className="text-sm font-semibold text-gray-900 mb-6 uppercase tracking-wide">
                    Invoice Status Distribution
                </h1>
                {statusData && statusData.length > 0 ? (
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                    label={({ name, value, percent }) => 
                                        `${name}: ${value} (${(percent * 100).toFixed(0)}%)`
                                    }
                                    labelLine={{ stroke: '#9CA3AF', strokeWidth: 1 }}
                                >
                                    {statusData.map((entry, index) => (
                                        <Cell 
                                            key={`cell-${index}`} 
                                            fill={getStatusColor(entry.name, index)} 
                                            stroke="white"
                                            strokeWidth={2}
                                        />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        borderRadius: '12px',
                                        border: 'none',
                                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                        padding: '12px',
                                        fontSize: '14px'
                                    }}
                                    formatter={(value, name) => [value, name]}
                                />
                                <Legend
                                    verticalAlign="bottom"
                                    align="center"
                                    iconType="circle"
                                    iconSize={10}
                                    wrapperStyle={{ paddingTop: '20px', fontSize: '13px', fontWeight: 500 }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="h-[300px] w-full flex items-center justify-center">
                        <p className="text-gray-500 text-sm">No invoice data available</p>
                    </div>
                )}
            </div>
        </div>
    );
}

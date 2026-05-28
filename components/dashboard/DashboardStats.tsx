import { Banknote, Clock, AlertTriangle, TrendingUp } from "lucide-react";

interface DashboardStatsData {
  totalRevenue: number;
  pendingAmount: number;
  overdueAmount: number;
  totalInvoices: number;
  highRiskCount: number;
}

export function DashboardStats({ stats }: { stats?: DashboardStatsData }) {
  if (!stats) return null;

  const cards = [
    {
      title: "Total Revenue",
      value: `₹${(stats.totalRevenue || 0).toLocaleString()}`,
      icon: Banknote,
      color: "text-green-600",
      bg: "bg-green-50",
      border: "border-green-100",
    },
    {
      title: "Pending Amount",
      value: `₹${(stats.pendingAmount || 0).toLocaleString()}`,
      icon: Clock,
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-100",
    },
    {
      title: "Overdue Amount",
      value: `₹${(stats.overdueAmount || 0).toLocaleString()}`,
      icon: AlertTriangle,
      color: "text-red-600",
      bg: "bg-red-50",
      border: "border-red-100",
    },
    {
      title: "High Risk Clients",
      value: stats.highRiskCount || 0,
      icon: TrendingUp,
      color: "text-orange-600",
      bg: "bg-orange-50",
      border: "border-orange-100",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card, index) => (
        <div
          key={index}
          className={`rounded-xl border ${card.border} bg-white p-5 shadow-sm`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {card.title}
              </p>
              <p className={`text-2xl font-bold mt-1 ${card.color}`}>
                {card.value}
              </p>
            </div>
            <div
              className={`h-10 w-10 rounded-lg ${card.bg} flex items-center justify-center`}
            >
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

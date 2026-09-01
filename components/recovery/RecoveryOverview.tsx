"use client";

import { Banknote, AlertTriangle, Clock, ShieldAlert, TrendingUp, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCountUp, useIncreaseFlash } from "@/hooks/useCountUp";

type Summary = {
  totalAtRisk: number;
  expectedRecovery: number;
  recoveredAmount?: number;
  overdueCount: number;
  paidCount: number;
  statusCounts: Record<string, number>;
};

function AnimatedMoney({
  value,
  className,
  prefix = "₹",
}: {
  value: number;
  className: string;
  prefix?: string;
}) {
  const animated = useCountUp(value);
  return (
    <p className={`text-2xl font-bold mt-1 tabular-nums ${className}`}>
      {prefix}
      {Math.round(animated).toLocaleString("en-IN")}
    </p>
  );
}

export function RecoveryOverview({
  summary,
  loading,
  safeDemo,
  onRunSweep,
}: {
  summary: Summary | null;
  loading: boolean;
  safeDemo?: boolean;
  onRunSweep: () => void;
}) {
  const blocked = summary?.statusCounts?.BLOCKED ?? 0;
  const awaiting = summary?.statusCounts?.AWAITING_APPROVAL ?? 0;
  const recovered = summary?.recoveredAmount ?? 0;
  // Flash green the moment recovered money grows (webhook just landed).
  const justRecovered = useIncreaseFlash(recovered);

  const cards = [
    {
      title: "Recovered",
      value: `₹${recovered.toLocaleString("en-IN")}`,
      animated: true as const,
      flash: justRecovered,
      icon: TrendingUp,
      color: justRecovered ? "text-emerald-500" : "text-green-600",
      bg: "bg-green-50",
      border: "border-green-200",
    },
    {
      title: "At Risk",
      value: `₹${(summary?.totalAtRisk ?? 0).toLocaleString("en-IN")}`,
      icon: AlertTriangle,
      color: "text-red-600",
      bg: "bg-red-50",
      border: "border-red-100",
    },
    {
      title: "Expected Recovery",
      value: `₹${(summary?.expectedRecovery ?? 0).toLocaleString("en-IN")}`,
      icon: Banknote,
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-100",
    },
    {
      title: "Open Recovery Cases",
      value: summary?.overdueCount ?? 0,
      icon: Clock,
      color: "text-gray-700",
      bg: "bg-gray-50",
      border: "border-gray-100",
    },
    {
      title: "Awaiting Approval",
      value: awaiting,
      icon: ShieldAlert,
      color: "text-orange-600",
      bg: "bg-orange-50",
      border: "border-orange-100",
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              AI Revenue Recovery
            </h1>
            {safeDemo && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-[10px] font-bold text-emerald-700 uppercase tracking-widest">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                Safe demo
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Autonomous agent that scores overdue invoices, picks recovery
            strategies and records a safe, auditable demo plan. No customer is
            contacted from this screen.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.assign("/dashboard/recovery/analytics")}
          >
            <Brain className="h-4 w-4" />
            Analytics
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={onRunSweep}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            ) : null}
            Run Safe Demo
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        {cards.map((card) => (
          <div
            key={card.title}
            className={`rounded-xl border ${card.border} p-5 shadow-sm transition-colors duration-700 ${
              card.flash ? "bg-emerald-50 border-emerald-300" : "bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {card.title}
                </p>
                {"animated" in card && card.animated ? (
                  <AnimatedMoney value={recovered} className={card.color} />
                ) : (
                  <p className={`text-2xl font-bold mt-1 ${card.color}`}>
                    {card.value}
                  </p>
                )}
                {card.flash && (
                  <p className="text-[10px] font-semibold text-emerald-600 mt-0.5 animate-pulse">
                    ▲ payment received
                  </p>
                )}
              </div>
              <div
                className={`h-10 w-10 rounded-lg ${card.bg} flex items-center justify-center shrink-0`}
              >
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {(blocked > 0 || awaiting > 0) && (
        <div className="flex flex-wrap gap-2 mb-4 text-xs">
          {awaiting > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 font-medium">
              {awaiting} case(s) need human approval
            </span>
          )}
          {blocked > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-700 font-medium">
              {blocked} case(s) blocked by policy
            </span>
          )}
        </div>
      )}
    </div>
  );
}

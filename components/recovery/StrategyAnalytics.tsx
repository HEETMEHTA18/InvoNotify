"use client";

import { useEffect, useState } from "react";
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
import { Loader2, Brain, ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type StrategyStat = {
  actionType: string;
  riskLevel: string;
  attempts: number;
  wins: number;
  winRate: number;
};

type MetricsPayload = {
  summary: {
    totalCases: number;
    casesLast24h: number;
    casesLast7d: number;
    totalRecovered: number;
  };
  statusDistribution: Record<string, number>;
  actionBreakdown: Array<{ action: string; status: string; count: number }>;
  learningLoop?: {
    preferredByRiskLevel: Record<string, string>;
    strategyStats: StrategyStat[];
    minSampleSize: number;
  };
};

type RecoveryOverview = {
  summary: { amountAtRisk: number; uniqueSettledRecovered: number; recoveryRate: number; safeDemoRecovered: number };
  funnel: Record<"detected" | "diagnosed" | "actioned" | "contactedOrRetried" | "recovered" | "escalated" | "stopped", number>;
  provenance: { uniqueSettledRevenue: { note: string }; actionHistory: { simulatedAttempts: number; note: string } };
};

const STATUS_COLORS: Record<string, string> = {
  PAID: "#10B981",
  OPEN: "#6B7280",
  CONTACTED: "#3B82F6",
  ESCALATED: "#8B5CF6",
  AWAITING_APPROVAL: "#F59E0B",
  BLOCKED: "#EF4444",
};

const RISK_BADGE: Record<string, string> = {
  LOW: "bg-green-100 text-green-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  HIGH: "bg-red-100 text-red-700",
};

function shortenAction(action: string) {
  return action
    .replace("CREATE_PAYMENT_LINK", "Pay Link")
    .replace("RESEND_PAYMENT_LINK", "Resend")
    .replace("SEND_REMINDER", "Reminder")
    .replace("SCHEDULE_FOLLOWUP", "Follow-up")
    .replace("ESCALATE_TO_HUMAN", "Human");
}

export function StrategyAnalytics() {
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [overview, setOverview] = useState<RecoveryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [metricsRes, overviewRes] = await Promise.all([fetch("/api/ai/metrics"), fetch("/api/v1/analytics/overview?days=365")]);
        if (!metricsRes.ok) throw new Error("Failed to load metrics");
        if (!cancelled) {
          setData(await metricsRes.json());
          if (overviewRes.ok) setOverview(await overviewRes.json());
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load metrics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading strategy analytics…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-500">
        {error || "No analytics available."}
      </div>
    );
  }

  const ll = data.learningLoop;

  // Aggregate win-rates across risk levels per action for the bar chart.
  const perAction = new Map<string, { wins: number; attempts: number }>();
  for (const s of ll?.strategyStats ?? []) {
    const agg = perAction.get(s.actionType) ?? { wins: 0, attempts: 0 };
    agg.wins += s.wins;
    agg.attempts += s.attempts;
    perAction.set(s.actionType, agg);
  }
  const winRateData = Array.from(perAction.entries())
    .map(([action, a]) => ({
      action: shortenAction(action),
      winRate: Math.round((a.wins / Math.max(1, a.attempts)) * 100),
      attempts: a.attempts,
    }))
    .sort((x, y) => y.winRate - x.winRate);

  const statusData = Object.entries(data.statusDistribution).map(([name, value]) => ({
    name: name.replace(/_/g, " "),
    value,
  }));

  const kpis = [
    { label: "Total Cases", value: data.summary.totalCases.toLocaleString("en-IN"), cls: "text-gray-900" },
    { label: "Recovered", value: `₹${Math.round(data.summary.totalRecovered).toLocaleString("en-IN")}`, cls: "text-green-600" },
    { label: "New (24h)", value: data.summary.casesLast24h, cls: "text-blue-600" },
    { label: "New (7d)", value: data.summary.casesLast7d, cls: "text-purple-600" },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/recovery">
              <Button variant="ghost" size="icon-xs" aria-label="Back to recovery">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Strategy Analytics</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            What the learning loop has proven — win-rates feed back into every
            future AI decision.
          </p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{k.label}</p>
            <p className={`text-2xl font-bold mt-1 ${k.cls}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {overview && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-5 mb-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-sky-950">Recovery funnel and evidence</p>
              <p className="text-xs text-sky-800 mt-1">Confirmed recovery is settlement-ledger backed; simulated actions are labelled and never presented as customer contact.</p>
            </div>
            <div className="text-right"><p className="text-xs text-sky-800">Confirmed recovery rate</p><p className="text-xl font-bold text-sky-950">{overview.summary.recoveryRate.toFixed(2)}%</p></div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mt-4">
            {[
              ["Detected", overview.funnel.detected], ["Diagnosed", overview.funnel.diagnosed], ["Actioned", overview.funnel.actioned], ["Contacted", overview.funnel.contactedOrRetried], ["Recovered", overview.funnel.recovered], ["Escalated", overview.funnel.escalated], ["Stopped", overview.funnel.stopped],
            ].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-white border border-sky-100 px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p><p className="text-lg font-bold text-gray-900">{value}</p></div>)}
          </div>
          <p className="text-[11px] text-sky-900 mt-3">{overview.provenance.uniqueSettledRevenue.note} {overview.provenance.actionHistory.note}</p>
        </div>
      )}

      {/* Learning-loop callout */}
      {ll && Object.keys(ll.preferredByRiskLevel).length > 0 && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-5 mb-6">
          <div className="flex items-start gap-3">
            <Brain className="h-5 w-5 text-violet-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-violet-900 flex items-center gap-1.5">
                Learning loop active
                <Sparkles className="h-3.5 w-3.5" />
              </p>
              <p className="text-xs text-violet-700 mt-1">
                Proven best strategies per risk segment (min {ll.minSampleSize}{" "}
                samples) — the decision agent now prefers these automatically:
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(ll.preferredByRiskLevel).map(([level, action]) => (
                  <span key={level} className="inline-flex items-center gap-1.5 text-xs">
                    <span className={`px-2 py-0.5 rounded-full font-bold ${RISK_BADGE[level] ?? "bg-gray-100 text-gray-700"}`}>
                      {level}
                    </span>
                    <span className="font-mono text-[11px] bg-white border border-violet-200 rounded px-2 py-0.5 text-gray-800">
                      {shortenAction(action)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Win-rate chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
            Recovery Win-Rate by Action
          </h3>
          {winRateData.length === 0 ? (
            <p className="text-sm text-gray-400 italic py-10 text-center">
              Not enough outcome data yet — run recovery sweeps and let payments
              land to build the evidence base.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={winRateData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="action" tick={{ fontSize: 12 }} />
                <YAxis unit="%" tick={{ fontSize: 12 }} domain={[0, 100]} />
                <Tooltip
                  formatter={(value: unknown, name: unknown) =>
                    String(name) === "winRate" ? [`${value}%`, "Win rate"] : [String(value), String(name)]
                  }
                />
                <Bar dataKey="winRate" fill="#10B981" radius={[6, 6, 0, 0]} maxBarSize={56} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Status distribution */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
            Case Pipeline
          </h3>
          {statusData.length === 0 ? (
            <p className="text-sm text-gray-400 italic py-10 text-center">No cases yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={STATUS_COLORS[entry.name.replace(/ /g, "_")] ?? `hsl(${i * 57}, 70%, 55%)`} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Tooltip formatter={(v: unknown) => [String(v), "Cases"]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

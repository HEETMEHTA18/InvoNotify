"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CibilMeter } from "@/components/customers/CibilMeter";
import { CreditCard, RefreshCw, Users, TrendingUp, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type CustomerCredit = {
  id: string;
  name: string;
  email: string;
  cibilScore: number | null;
  creditTier: string;
  lastChecked: string | null;
};

const TIER_COLORS: Record<string, string> = {
  Excellent: "bg-green-100 text-green-800",
  Good: "bg-blue-100 text-blue-800",
  Fair: "bg-yellow-100 text-yellow-800",
  Poor: "bg-orange-100 text-orange-800",
  "Very Poor": "bg-red-100 text-red-800",
  Unknown: "bg-gray-100 text-gray-800",
};

function getTier(score: number | null): string {
  if (!score) return "Unknown";
  if (score >= 750) return "Excellent";
  if (score >= 700) return "Good";
  if (score >= 650) return "Fair";
  if (score >= 550) return "Poor";
  return "Very Poor";
}

export default function CreditScoresPage() {
  const [customers, setCustomers] = useState<CustomerCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  async function fetchCustomers() {
    try {
      const res = await fetch("/api/customers");
      if (res.ok) {
        const data = await res.json();
        setCustomers(
          (data.customers || data || []).map((c: Record<string, unknown>) => ({
            id: c.id as string,
            name: (c.name as string) || "Unknown",
            email: (c.email as string) || "",
            cibilScore: (c.cibilScore as number) || null,
            creditTier: getTier((c.cibilScore as number) || null),
            lastChecked: (c.updatedAt as string) || null,
          }))
        );
      }
    } catch {
      toast.error("Failed to load customers");
    } finally {
      setLoading(false);
    }
  }

  async function fetchAllScores() {
    setFetching(true);
    try {
      const ids = customers.filter((c) => !c.cibilScore).map((c) => c.id);
      if (ids.length === 0) {
        toast.info("All customers already have credit scores");
        setFetching(false);
        return;
      }

      const res = await fetch("/api/v1/credit-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerIds: ids.slice(0, 20) }),
      });

      if (res.ok) {
        const data = await res.json();
        const scoreMap = new Map<string, number>();
        (data.results || []).forEach((r: Record<string, unknown>) => {
          scoreMap.set(r.customerId as string, r.score as number);
        });

        setCustomers((prev) =>
          prev.map((c) => {
            const score = scoreMap.get(c.id);
            return score
              ? { ...c, cibilScore: score, creditTier: getTier(score), lastChecked: new Date().toISOString() }
              : c;
          })
        );
        toast.success(`Fetched credit scores for ${scoreMap.size} customers`);
      }
    } catch {
      toast.error("Failed to fetch credit scores");
    } finally {
      setFetching(false);
    }
  }

  const avgScore = customers.filter((c) => c.cibilScore).reduce((sum, c) => sum + (c.cibilScore || 0), 0) /
    (customers.filter((c) => c.cibilScore).length || 1);

  const tierCounts = customers.reduce(
    (acc, c) => {
      acc[c.creditTier] = (acc[c.creditTier] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="h-6 w-6" />
            Credit Score Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitor customer credit scores for risk-based recovery decisions
          </p>
        </div>
        <Button onClick={fetchAllScores} disabled={fetching}>
          {fetching ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Fetch Scores
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{customers.length}</p>
                <p className="text-xs text-gray-500">Total Customers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{Math.round(avgScore)}</p>
                <p className="text-xs text-gray-500">Average Score</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CreditCard className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{tierCounts["Excellent"] || 0}</p>
                <p className="text-xs text-gray-500">Excellent (750+)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{(tierCounts["Poor"] || 0) + (tierCounts["Very Poor"] || 0)}</p>
                <p className="text-xs text-gray-500">Below 650 (High Risk)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Score Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Score Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-8">
            <CibilMeter score={avgScore} size={200} />
            <div className="flex-1 space-y-3">
              {Object.entries(TIER_COLORS).filter(([k]) => k !== "Unknown").map(([tier, color]) => (
                <div key={tier} className="flex items-center gap-3">
                  <Badge className={`${color} border-0`}>{tier}</Badge>
                  <div className="flex-1 bg-gray-100 rounded-full h-3">
                    <div
                      className="h-3 rounded-full bg-current opacity-20"
                      style={{ width: `${((tierCounts[tier] || 0) / (customers.length || 1)) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium w-8 text-right">{tierCounts[tier] || 0}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customer Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer Credit Scores</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading customers...</div>
          ) : customers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No customers found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium text-gray-600">Customer</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-600">Email</th>
                    <th className="text-center py-3 px-2 font-medium text-gray-600">Score</th>
                    <th className="text-center py-3 px-2 font-medium text-gray-600">Tier</th>
                    <th className="text-center py-3 px-2 font-medium text-gray-600">Gauge</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 px-2 font-medium">{c.name}</td>
                      <td className="py-3 px-2 text-gray-500">{c.email}</td>
                      <td className="py-3 px-2 text-center font-bold">{c.cibilScore || "—"}</td>
                      <td className="py-3 px-2 text-center">
                        <Badge className={`${TIER_COLORS[c.creditTier]} border-0 text-xs`}>{c.creditTier}</Badge>
                      </td>
                      <td className="py-3 px-2 flex justify-center">
                        {c.cibilScore ? <CibilMeter score={c.cibilScore} size={80} compact /> : <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

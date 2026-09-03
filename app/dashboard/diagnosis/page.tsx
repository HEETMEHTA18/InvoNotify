"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Brain,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

type RecoveryCase = {
  id: number;
  invoiceId: number;
  status: string;
  stage: string;
  riskScore: number;
  expectedRecovery: number;
  invoice: {
    invoiceNumber: string;
    clientName: string;
    balance: number;
    currency: string;
    dueDate: string | null;
  };
  actions: Array<{ status: string; actionType: string }>;
};

const STAGE_COLORS: Record<string, string> = {
  DETECTED: "bg-gray-100 text-gray-800",
  DIAGNOSED: "bg-blue-100 text-blue-800",
  ACTIONED: "bg-yellow-100 text-yellow-800",
  CONTACTED: "bg-purple-100 text-purple-800",
  RECOVERED: "bg-green-100 text-green-800",
  ESCALATED: "bg-red-100 text-red-800",
  STOPPED: "bg-gray-100 text-gray-500",
};

const RISK_COLORS: Record<string, string> = {
  LOW: "bg-green-100 text-green-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800",
};

function getRiskLevel(score: number): string {
  if (score >= 0.85) return "CRITICAL";
  if (score >= 0.7) return "HIGH";
  if (score >= 0.4) return "MEDIUM";
  return "LOW";
}

export default function DiagnosisPage() {
  const [cases, setCases] = useState<RecoveryCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);

  useEffect(() => {
    fetchCases();
  }, []);

  async function fetchCases() {
    try {
      const res = await fetch("/api/ai/recovery");
      if (res.ok) {
        const data = await res.json();
        setCases(data.cases || []);
      }
    } catch {
      toast.error("Failed to load recovery cases");
    } finally {
      setLoading(false);
    }
  }

  async function runSweep() {
    setSweeping(true);
    try {
      const res = await fetch("/api/ai/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      if (res.ok) {
        toast.success("Recovery sweep completed");
        fetchCases();
      }
    } catch {
      toast.error("Sweep failed");
    } finally {
      setSweeping(false);
    }
  }

  const stageCounts = cases.reduce(
    (acc, c) => {
      acc[c.stage] = (acc[c.stage] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const riskCounts = cases.reduce(
    (acc, c) => {
      const level = getRiskLevel(c.riskScore);
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const totalExpected = cases.reduce((sum, c) => sum + (c.expectedRecovery || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Brain className="h-6 w-6" />
            ML Failure Diagnosis
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            AI-powered failure classification and risk assessment
          </p>
        </div>
        <Button onClick={runSweep} disabled={sweeping}>
          {sweeping ? (
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Brain className="h-4 w-4 mr-2" />
          )}
          Run AI Sweep
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Brain className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{cases.length}</p>
                <p className="text-xs text-gray-500">Total Cases</p>
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
                <p className="text-2xl font-bold">₹{totalExpected.toLocaleString()}</p>
                <p className="text-xs text-gray-500">Expected Recovery</p>
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
                <p className="text-2xl font-bold">
                  {(riskCounts["CRITICAL"] || 0) + (riskCounts["HIGH"] || 0)}
                </p>
                <p className="text-xs text-gray-500">High/Critical Risk</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stageCounts["RECOVERED"] || 0}</p>
                <p className="text-xs text-gray-500">Recovered</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Risk Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(RISK_COLORS).map(([level, color]) => (
              <div key={level} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Badge className={`${color} border-0`}>{level}</Badge>
                <span className="text-lg font-bold">{riskCounts[level] || 0}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stage Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recovery Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {["DETECTED", "DIAGNOSED", "ACTIONED", "CONTACTED", "RECOVERED", "ESCALATED", "STOPPED"].map(
              (stage, i) => (
                <div key={stage} className="flex items-center gap-2">
                  <div className="text-center">
                    <Badge className={`${STAGE_COLORS[stage]} border-0 mb-1`}>{stage}</Badge>
                    <p className="text-lg font-bold">{stageCounts[stage] || 0}</p>
                  </div>
                  {i < 6 && <ArrowRight className="h-4 w-4 text-gray-300 flex-shrink-0" />}
                </div>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cases Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recovery Cases</CardTitle>
          <Link href="/dashboard/recovery">
            <Button variant="outline" size="sm">
              View Full Recovery Dashboard →
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading cases...</div>
          ) : cases.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No recovery cases yet. Overdue invoices will automatically create cases.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium text-gray-600">Invoice</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-600">Customer</th>
                    <th className="text-right py-3 px-2 font-medium text-gray-600">Balance</th>
                    <th className="text-center py-3 px-2 font-medium text-gray-600">Risk</th>
                    <th className="text-center py-3 px-2 font-medium text-gray-600">Stage</th>
                    <th className="text-center py-3 px-2 font-medium text-gray-600">Expected</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.slice(0, 20).map((c) => {
                    const risk = getRiskLevel(c.riskScore);
                    return (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-3 px-2 font-medium">{c.invoice.invoiceNumber}</td>
                        <td className="py-3 px-2">{c.invoice.clientName}</td>
                        <td className="py-3 px-2 text-right">
                          {c.invoice.currency} {Number(c.invoice.balance).toLocaleString()}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <Badge className={`${RISK_COLORS[risk]} border-0 text-xs`}>{risk}</Badge>
                        </td>
                        <td className="py-3 px-2 text-center">
                          <Badge className={`${STAGE_COLORS[c.stage] || STAGE_COLORS.DETECTED} border-0 text-xs`}>
                            {c.stage}
                          </Badge>
                        </td>
                        <td className="py-3 px-2 text-right text-green-600 font-medium">
                          ₹{(c.expectedRecovery || 0).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

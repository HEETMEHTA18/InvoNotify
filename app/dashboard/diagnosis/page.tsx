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
} from "lucide-react";
import { toast } from "sonner";

type DiagnosisResult = {
  caseId: number;
  invoiceNumber: string;
  customerName: string;
  category: string;
  confidence: number;
  severity: string;
  factors: string[];
  diagnosedAt: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  PAYMENT_FAILURE: "bg-red-100 text-red-800",
  CHECKOUT_ABANDONMENT: "bg-orange-100 text-orange-800",
  MANDATE_FAILURE: "bg-yellow-100 text-yellow-800",
  SUBSCRIPTION_ISSUE: "bg-blue-100 text-blue-800",
  DISPUTE: "bg-purple-100 text-purple-800",
  UNKNOWN: "bg-gray-100 text-gray-800",
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800",
  HIGH: "bg-orange-100 text-orange-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  LOW: "bg-green-100 text-green-800",
};

export default function DiagnosisPage() {
  const [cases, setCases] = useState<DiagnosisResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [diagnosing, setDiagnosing] = useState(false);

  useEffect(() => {
    fetchCases();
  }, []);

  async function fetchCases() {
    try {
      const res = await fetch("/api/ai/recovery");
      if (res.ok) {
        const data = await res.json();
        const caseList = data.cases || [];
        // Fetch diagnosis for each case
        const diagnosed = await Promise.all(
          caseList.slice(0, 30).map(async (c: Record<string, unknown>) => {
            try {
              const diagRes = await fetch(
                `/api/v1/recovery-cases/${c.id}/diagnose`,
                { method: "POST" }
              );
              if (diagRes.ok) {
                const diag = await diagRes.json();
                return {
                  caseId: c.id as number,
                  invoiceNumber: (c.invoiceNumber as string) || `#${c.id}`,
                  customerName: (c.customerName as string) || "Unknown",
                  category: diag.category || "UNKNOWN",
                  confidence: diag.confidence || 0,
                  severity: diag.severity || "MEDIUM",
                  factors: diag.factors || [],
                  diagnosedAt: new Date().toISOString(),
                };
              }
            } catch {
              // Skip failed diagnoses
            }
            return null;
          })
        );
        setCases(diagnosed.filter(Boolean) as DiagnosisResult[]);
      }
    } catch {
      toast.error("Failed to load cases");
    } finally {
      setLoading(false);
    }
  }

  async function runBatchDiagnosis() {
    setDiagnosing(true);
    try {
      await fetchCases();
      toast.success("Batch diagnosis complete");
    } finally {
      setDiagnosing(false);
    }
  }

  const categoryCounts = cases.reduce(
    (acc, c) => {
      acc[c.category] = (acc[c.category] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const avgConfidence = cases.length
    ? cases.reduce((sum, c) => sum + c.confidence, 0) / cases.length
    : 0;

  const highSeverity = cases.filter((c) => c.severity === "CRITICAL" || c.severity === "HIGH").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Brain className="h-6 w-6" />
            ML Failure Diagnosis
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            AI-powered failure classification and root cause analysis
          </p>
        </div>
        <Button onClick={runBatchDiagnosis} disabled={diagnosing}>
          {diagnosing ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
          Run Diagnosis
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
                <p className="text-xs text-gray-500">Diagnosed Cases</p>
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
                <p className="text-2xl font-bold">{Math.round(avgConfidence * 100)}%</p>
                <p className="text-xs text-gray-500">Avg Confidence</p>
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
                <p className="text-2xl font-bold">{highSeverity}</p>
                <p className="text-xs text-gray-500">High/Critical Severity</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <BarChart3 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{Object.keys(categoryCounts).length}</p>
                <p className="text-xs text-gray-500">Failure Categories</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Failure Categories</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(categoryCounts).map(([cat, count]) => (
              <div key={cat} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Badge className={`${CATEGORY_COLORS[cat] || CATEGORY_COLORS.UNKNOWN} border-0`}>
                  {cat.replace(/_/g, " ")}
                </Badge>
                <span className="text-lg font-bold">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Diagnosis Results Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Diagnosis Results</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading and diagnosing cases...</div>
          ) : cases.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No cases to diagnose. Create recovery cases first.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium text-gray-600">Invoice</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-600">Customer</th>
                    <th className="text-center py-3 px-2 font-medium text-gray-600">Category</th>
                    <th className="text-center py-3 px-2 font-medium text-gray-600">Confidence</th>
                    <th className="text-center py-3 px-2 font-medium text-gray-600">Severity</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-600">Key Factors</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => (
                    <tr key={c.caseId} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 px-2 font-medium">{c.invoiceNumber}</td>
                      <td className="py-3 px-2">{c.customerName}</td>
                      <td className="py-3 px-2 text-center">
                        <Badge className={`${CATEGORY_COLORS[c.category] || CATEGORY_COLORS.UNKNOWN} border-0 text-xs`}>
                          {c.category.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <div className="flex items-center gap-2 justify-center">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div
                              className="h-2 rounded-full bg-blue-600"
                              style={{ width: `${c.confidence * 100}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium">{Math.round(c.confidence * 100)}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <Badge className={`${SEVERITY_COLORS[c.severity] || SEVERITY_COLORS.MEDIUM} border-0 text-xs`}>
                          {c.severity}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-xs text-gray-600 max-w-[200px] truncate">
                        {c.factors?.slice(0, 2).join(", ") || "—"}
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

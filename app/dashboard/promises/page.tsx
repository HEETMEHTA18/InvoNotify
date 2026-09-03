"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CalendarCheck,
  CheckCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Send,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

type Promise = {
  id: string;
  caseId: number;
  invoiceNumber: string;
  customerName: string;
  amount: number;
  currency: string;
  promisedDate: string;
  status: "PENDING" | "FULFILLED" | "MISSED" | "PARTIAL";
  source: string;
  createdAt: string;
};

const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType }> = {
  PENDING: { color: "bg-yellow-100 text-yellow-800", icon: Clock },
  FULFILLED: { color: "bg-green-100 text-green-800", icon: CheckCircle },
  MISSED: { color: "bg-red-100 text-red-800", icon: AlertTriangle },
  PARTIAL: { color: "bg-blue-100 text-blue-800", icon: ArrowRight },
};

export default function PromisesPage() {
  const [promises, setPromises] = useState<Promise[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [reminderResult, setReminderResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetchPromises();
  }, []);

  async function fetchPromises() {
    try {
      const res = await fetch("/api/v1/promises/reminders");
      if (res.ok) {
        const data = await res.json();
        setPromises(data.promises || []);
      }
    } catch {
      toast.error("Failed to load promises");
    } finally {
      setLoading(false);
    }
  }

  async function processReminders() {
    setProcessing(true);
    try {
      const res = await fetch("/api/v1/promises/reminders", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setReminderResult(data);
        toast.success(`Processed ${data.sent || 0} reminders`);
        fetchPromises();
      }
    } catch {
      toast.error("Failed to process reminders");
    } finally {
      setProcessing(false);
    }
  }

  const pending = promises.filter((p) => p.status === "PENDING");
  const fulfilled = promises.filter((p) => p.status === "FULFILLED");
  const missed = promises.filter((p) => p.status === "MISSED");
  const totalAmount = promises.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarCheck className="h-6 w-6" />
            Promise-to-Pay
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Track customer payment promises and automated reminders
          </p>
        </div>
        <Button onClick={processReminders} disabled={processing}>
          {processing ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          Send Reminders
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pending.length}</p>
                <p className="text-xs text-gray-500">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{fulfilled.length}</p>
                <p className="text-xs text-gray-500">Fulfilled</p>
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
                <p className="text-2xl font-bold">{missed.length}</p>
                <p className="text-xs text-gray-500">Missed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <CalendarCheck className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">₹{totalAmount.toLocaleString()}</p>
                <p className="text-xs text-gray-500">Total Promised</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reminder Result */}
      {reminderResult && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <p className="text-sm text-green-800">
              <strong>Last Reminder Batch:</strong>{" "}
              {(reminderResult?.sent as number) || 0} reminders sent, {(reminderResult?.skipped as number) || 0} skipped
            </p>
          </CardContent>
        </Card>
      )}

      {/* Promise List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Promises</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading promises...</div>
          ) : promises.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No payment promises yet. Promises are created when customers commit to a payment date.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium text-gray-600">Invoice</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-600">Customer</th>
                    <th className="text-right py-3 px-2 font-medium text-gray-600">Amount</th>
                    <th className="text-center py-3 px-2 font-medium text-gray-600">Promised Date</th>
                    <th className="text-center py-3 px-2 font-medium text-gray-600">Status</th>
                    <th className="text-center py-3 px-2 font-medium text-gray-600">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {promises.map((p) => {
                    const config = STATUS_CONFIG[p.status] || STATUS_CONFIG.PENDING;
                    const Icon = config.icon;
                    return (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-3 px-2 font-medium">{p.invoiceNumber || `#${p.caseId}`}</td>
                        <td className="py-3 px-2">{p.customerName}</td>
                        <td className="py-3 px-2 text-right font-medium">
                          {p.currency} {p.amount.toLocaleString()}
                        </td>
                        <td className="py-3 px-2 text-center">
                          {new Date(p.promisedDate).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <Badge className={`${config.color} border-0 flex items-center gap-1 w-fit mx-auto`}>
                            <Icon className="h-3 w-3" />
                            {p.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-2 text-center text-xs text-gray-500">{p.source}</td>
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

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
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

type PromiseSummary = {
  total: number;
  active: number;
  missed: number;
  fulfilled: number;
};

type ReminderSummary = {
  total: number;
  sent: number;
};

export default function PromisesPage() {
  const [summary, setSummary] = useState<PromiseSummary | null>(null);
  const [reminders, setReminders] = useState<ReminderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchSummary();
  }, []);

  async function fetchSummary() {
    try {
      const res = await fetch("/api/v1/promises/reminders");
      if (res.ok) {
        const data = await res.json();
        setSummary(data.promises);
        setReminders(data.reminders);
      }
    } catch {
      toast.error("Failed to load promise data");
    } finally {
      setLoading(false);
    }
  }

  async function processReminders() {
    setProcessing(true);
    try {
      const res = await fetch("/api/v1/promises/reminders", {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Reminders processed successfully");
        fetchSummary();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to process reminders");
      }
    } catch {
      toast.error("Failed to process reminders");
    } finally {
      setProcessing(false);
    }
  }

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
          {processing ? (
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Process Reminders
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <CalendarCheck className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{loading ? "—" : summary?.total ?? 0}</p>
                <p className="text-xs text-gray-500">Total Promises</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{loading ? "—" : summary?.active ?? 0}</p>
                <p className="text-xs text-gray-500">Active (Pending)</p>
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
                <p className="text-2xl font-bold">{loading ? "—" : summary?.fulfilled ?? 0}</p>
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
                <p className="text-2xl font-bold">{loading ? "—" : summary?.missed ?? 0}</p>
                <p className="text-xs text-gray-500">Missed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reminder Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reminder Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Send className="h-4 w-4 text-blue-600" />
                <span className="font-medium">Reminders Sent</span>
              </div>
              <p className="text-3xl font-bold">{loading ? "—" : reminders?.sent ?? 0}</p>
              <p className="text-xs text-gray-500 mt-1">of {reminders?.total ?? 0} total</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span className="font-medium">Fulfillment Rate</span>
              </div>
              <p className="text-3xl font-bold">
                {loading
                  ? "—"
                  : summary?.total
                  ? `${Math.round(((summary?.fulfilled ?? 0) / summary.total) * 100)}%`
                  : "—"}
              </p>
              <p className="text-xs text-gray-500 mt-1">promises kept</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How Promise-to-Pay Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <h3 className="font-medium text-blue-900 mb-2">1. Customer Commits</h3>
              <p className="text-sm text-blue-700">
                During recovery, customers can promise to pay by a specific date. The system records the promise.
              </p>
            </div>
            <div className="p-4 bg-yellow-50 rounded-lg">
              <h3 className="font-medium text-yellow-900 mb-2">2. Automated Reminders</h3>
              <p className="text-sm text-yellow-700">
                The system sends reminders at 24h before, morning of, and 24h after the promised date via email + WhatsApp.
              </p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <h3 className="font-medium text-green-900 mb-2">3. Auto-Reconciliation</h3>
              <p className="text-sm text-green-700">
                When payment arrives, the promise is automatically marked as fulfilled. Missed promises escalate to human.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

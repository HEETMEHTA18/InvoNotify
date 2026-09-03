"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { RecoveryOverview } from "@/components/recovery/RecoveryOverview";
import {
  RecoveryCaseList,
  type RecoveryCaseItem,
} from "@/components/recovery/RecoveryCaseList";
import { RecoveryCaseDetail } from "@/components/recovery/RecoveryCaseDetail";
import { AgentFlow } from "@/components/recovery/AgentFlow";

type Summary = {
  totalAtRisk: number;
  expectedRecovery: number;
  recoveredAmount?: number;
  overdueCount: number;
  paidCount: number;
  statusCounts: Record<string, number>;
};

type SweepResult = {
  runId: number;
  totalInvoices: number;
  processed: number;
  actions: number;
  recoveredAmount: number;
  expectedRecoveryAmount: number;
  simulatedActions: number;
  invoiceResults: Array<{ invoiceId: number; recommendedAction: string }>;
};

export default function RecoveryPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cases, setCases] = useState<RecoveryCaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [detail, setDetail] = useState<{
    id: number;
    data: unknown;
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Refs let the poller detect payment transitions without re-subscribing.
  const paidCountRef = useRef<number | null>(null);
  const recoveredRef = useRef(0);
  // Suppress the "payment received" toast for the initial load.
  const hydratedRef = useRef(false);

  const fetchCases = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/recovery");
      if (!res.ok) throw new Error("Failed to load recovery cases");
      const json = await res.json();
      setSummary(json.summary);
      setCases(json.cases);

      const s = json.summary as Summary;
      const recoveredNow = s.recoveredAmount ?? 0;

      if (hydratedRef.current) {
        // Stage moment: a webhook just closed a case → celebrate it live.
        if (
          paidCountRef.current !== null &&
          s.paidCount > paidCountRef.current &&
          recoveredNow > recoveredRef.current
        ) {
          toast.success(
            `🎉 Payment received — ₹${(recoveredNow - recoveredRef.current).toLocaleString("en-IN")} recovered!`,
            { duration: 6000 },
          );
        }
      } else {
        hydratedRef.current = true;
      }

      paidCountRef.current = s.paidCount;
      recoveredRef.current = recoveredNow;
    } catch (err) {
      console.error(err);
      toast.error("Failed to load recovery cases");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  // Live war-room: poll every 5s so webhook-driven recoveries appear on
  // screen within seconds. Paused while a sweep runs or the tab is hidden.
  useEffect(() => {
    const POLL_MS = 5000;
    const timer = setInterval(() => {
      if (!document.hidden && !running) {
        fetchCases();
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [fetchCases, running]);

  const handleRunSweep = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/ai/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The dashboard is a showcase surface: recommendations and audit rows
        // are real, but no provider call or customer contact is made here.
        body: JSON.stringify({ dryRun: true }),
      });
      if (!res.ok) throw new Error("Recovery sweep failed");
      const result: SweepResult = await res.json();
      toast.success(
        `Safe demo run #${result.runId}: ${result.simulatedActions} recommendation(s) across ${result.processed} invoice(s). Expected recovery ₹${result.expectedRecoveryAmount.toLocaleString("en-IN")}. Confirmed recovered: ₹${result.recoveredAmount.toLocaleString("en-IN")}.`,
      );
      await fetchCases();
    } catch (err) {
      console.error(err);
      toast.error("Recovery sweep failed");
    } finally {
      setRunning(false);
    }
  };

  const handleSelectCase = async (c: RecoveryCaseItem) => {
    setDetail({ id: c.id, data: null });
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/ai/recovery/${c.id}`);
      if (!res.ok) throw new Error("Failed to load case detail");
      const json = await res.json();
      setDetail({ id: c.id, data: json.case });
    } catch (err) {
      console.error(err);
      toast.error("Failed to load case detail");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleApprove = async (caseId: number) => {
    try {
      const res = await fetch(`/api/ai/recovery/${caseId}/approve`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Approval failed");
      }
      const json = await res.json();
      toast.success(
        `Action executed: ${json.result?.status || "done"}${json.result?.fallbackUsed ? " (fallback used)" : ""}`,
      );
      setDetail(null);
      await fetchCases();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Approval failed");
    }
  };

  const handleCreatePaymentLink = async (invoiceId: number): Promise<string | null> => {
    try {
      const res = await fetch("/api/razorpay/payment-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const body = await res.json().catch(() => ({}));
      const paymentLinkUrl = body.shortUrl || body.paymentLinkUrl || null;

      if (!res.ok && res.status !== 409) {
        throw new Error(body.error || "Could not create Razorpay Test Mode payment link");
      }
      if (!paymentLinkUrl) {
        throw new Error("Razorpay did not return a checkout URL");
      }

      toast.success(res.status === 409 ? "Existing Razorpay Test Mode link loaded" : "Razorpay Test Mode link created");
      return paymentLinkUrl;
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not create Razorpay Test Mode payment link");
      return null;
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <RecoveryOverview
        summary={summary}
        loading={loading || running}
        safeDemo
        onRunSweep={handleRunSweep}
      />

      {running && (
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          AI agent is scoring invoices and planning recovery strategies…
        </div>
      )}

      <AgentFlow summary={summary} cases={cases} running={running} />

      <RecoveryCaseList cases={cases} onSelect={handleSelectCase} />

      {detail && (
        <RecoveryCaseDetail
          open={true}
          onClose={() => setDetail(null)}
          detail={detail.data as never}
          loading={detailLoading}
          onApprove={handleApprove}
          onCreatePaymentLink={handleCreatePaymentLink}
        />
      )}
    </div>
  );
}

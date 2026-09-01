"use client";

import { useState } from "react";
import {
  Search,
  Database,
  Gauge,
  Brain,
  ShieldCheck,
  Link2,
  Mail,
  UserCheck,
  Webhook,
  BadgeCheck,
  Ban,
  RefreshCw,
  ArrowRight,
  ArrowDown,
  ChevronDown,
  Lock,
} from "lucide-react";
import type { RecoveryCaseItem } from "./RecoveryCaseList";

type Summary = {
  totalAtRisk: number;
  expectedRecovery: number;
  recoveredAmount?: number;
  overdueCount: number;
  paidCount: number;
  statusCounts: Record<string, number>;
};

const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/**
 * Visual walkthrough of the recovery agent's pipeline.
 *
 * Every number shown is derived from the same live payload the case list
 * renders, so the diagram is a real-time view of the agent rather than a
 * static illustration — during a sweep the counts fill in stage by stage.
 */
export function AgentFlow({
  summary,
  cases,
  running,
}: {
  summary: Summary | null;
  cases: RecoveryCaseItem[];
  running?: boolean;
}) {
  const [open, setOpen] = useState(true);

  const blocked = summary?.statusCounts?.BLOCKED ?? 0;
  const awaiting = summary?.statusCounts?.AWAITING_APPROVAL ?? 0;
  const swept = summary?.overdueCount ?? 0;
  const scored = cases.filter((c) => c.riskScore > 0).length;
  const decided = cases.filter((c) => c.lastDecision).length;
  const allowed = Math.max(0, decided - awaiting - blocked);

  // Channel mix, counted from the action the agent actually last took.
  const byAction = (type: string) =>
    cases.filter((c) => c.status !== "BLOCKED" && c.lastActionType === type).length;
  const links = byAction("CREATE_PAYMENT_LINK") + byAction("RESEND_PAYMENT_LINK");
  const emails = byAction("SEND_REMINDER");
  const escalations = byAction("ESCALATE_TO_HUMAN");

  const paid = summary?.paidCount ?? 0;
  const recovered = summary?.recoveredAmount ?? 0;
  const expected = summary?.expectedRecovery ?? 0;

  const stages = [
    {
      n: 1,
      icon: Search,
      title: "Detect",
      what: "Sweep invoices past their due date with a balance still owing.",
      metric: `${swept} in scope`,
      tint: "text-slate-600",
      chip: "bg-slate-50 border-slate-200",
    },
    {
      n: 2,
      icon: Database,
      title: "Enrich",
      what: "Load payment history, average delay, CIBIL band and opt-out flags.",
      metric: "context per case",
      tint: "text-sky-600",
      chip: "bg-sky-50 border-sky-200",
    },
    {
      n: 3,
      icon: Gauge,
      title: "Score",
      what: "ML model rates default risk and predicts how much is recoverable.",
      metric: scored ? `${scored} scored · ${money(expected)}` : "awaiting sweep",
      tint: "text-indigo-600",
      chip: "bg-indigo-50 border-indigo-200",
    },
    {
      n: 4,
      icon: Brain,
      title: "Decide",
      what: "Agent proposes one action — reminder, payment link, escalate or stop.",
      metric: decided ? `${decided} proposed` : "awaiting sweep",
      tint: "text-violet-600",
      chip: "bg-violet-50 border-violet-200",
    },
    {
      n: 5,
      icon: ShieldCheck,
      title: "Policy gate",
      what: "Every proposal is checked against limits, cooldowns and consent.",
      metric: decided ? `${decided} evaluated` : "awaiting sweep",
      tint: "text-emerald-600",
      chip: "bg-emerald-50 border-emerald-200",
    },
  ];

  const verdicts = [
    {
      icon: BadgeCheck,
      label: "Allow",
      count: allowed,
      what: "Within every bound — the agent acts on its own.",
      cls: "border-emerald-200 bg-emerald-50",
      badge: "bg-emerald-600",
      text: "text-emerald-700",
    },
    {
      icon: UserCheck,
      label: "Needs approval",
      count: awaiting,
      what: "Above the auto-money limit or high risk — a human signs off first.",
      cls: "border-orange-200 bg-orange-50",
      badge: "bg-orange-500",
      text: "text-orange-700",
    },
    {
      icon: Ban,
      label: "Blocked",
      count: blocked,
      what: "Opted out, already chased enough, in cooldown, or too small to chase.",
      cls: "border-red-200 bg-red-50",
      badge: "bg-red-600",
      text: "text-red-700",
    },
  ];

  const channels = [
    {
      icon: Link2,
      label: "Razorpay payment link",
      count: links,
      what: "A live link the customer can pay in one tap.",
    },
    {
      icon: Mail,
      label: "Email reminder",
      count: emails,
      what: "A polite nudge, tone matched to the risk band.",
    },
    {
      icon: UserCheck,
      label: "Escalate to merchant",
      count: escalations,
      what: "Handed to you on this dashboard — no customer contact.",
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div>
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
            How the agent works
            {running && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 normal-case tracking-normal">
                <RefreshCw className="h-3 w-3 animate-spin" />
                running…
              </span>
            )}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5 normal-case">
            Five stages, one gate, three possible verdicts — with your live numbers at
            each step.
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-6 pb-6 pt-2 border-t border-gray-100">
          {/* ---------------------------------------------- sequential stages */}
          <div className="flex flex-col lg:flex-row lg:items-stretch gap-2">
            {stages.map((s, i) => (
              <div key={s.n} className="flex flex-col lg:flex-row lg:items-center gap-2 flex-1">
                <div
                  className={`flex-1 rounded-lg border ${s.chip} p-3 transition-opacity ${
                    running ? "animate-pulse" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-5 w-5 rounded-full bg-white border border-current/20 flex items-center justify-center text-[10px] font-bold text-gray-500 shrink-0">
                      {s.n}
                    </span>
                    <s.icon className={`h-4 w-4 ${s.tint} shrink-0`} />
                    <span className="text-xs font-bold text-gray-900">{s.title}</span>
                  </div>
                  <p className="text-[11px] text-gray-600 mt-1.5 leading-snug">{s.what}</p>
                  <p className={`text-[11px] font-semibold mt-1.5 tabular-nums ${s.tint}`}>
                    {s.metric}
                  </p>
                </div>
                {i < stages.length - 1 && (
                  <>
                    <ArrowRight className="h-4 w-4 text-gray-300 shrink-0 hidden lg:block" />
                    <ArrowDown className="h-4 w-4 text-gray-300 shrink-0 mx-auto lg:hidden" />
                  </>
                )}
              </div>
            ))}
          </div>

          {/* The guardrail that matters most: the model never holds the keys. */}
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
            <Lock className="h-3.5 w-3.5 text-gray-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-gray-600 leading-snug">
              <span className="font-semibold text-gray-800">The model never moves money.</span>{" "}
              It only returns a structured recommendation. Stage 5 decides whether that
              recommendation is permitted, and only then does the action engine call
              Razorpay — so no prompt can talk the system into charging a customer.
            </p>
          </div>

          <div className="flex justify-center py-2">
            <ArrowDown className="h-4 w-4 text-gray-300" />
          </div>

          {/* ------------------------------------------------- policy verdicts */}
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            Gate verdict
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {verdicts.map((v) => (
              <div key={v.label} className={`rounded-lg border ${v.cls} p-3`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <v.icon className={`h-4 w-4 ${v.text}`} />
                    <span className={`text-xs font-bold ${v.text}`}>{v.label}</span>
                  </div>
                  <span
                    className={`${v.badge} text-white text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums`}
                  >
                    {v.count}
                  </span>
                </div>
                <p className="text-[11px] text-gray-600 mt-1.5 leading-snug">{v.what}</p>
              </div>
            ))}
          </div>

          <div className="flex justify-center py-2">
            <ArrowDown className="h-4 w-4 text-gray-300" />
          </div>

          {/* ------------------------------------------------------- channels */}
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            Act — allowed and approved actions only
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {channels.map((c) => (
              <div
                key={c.label}
                className="rounded-lg border border-gray-200 bg-white p-3 flex items-start gap-2.5"
              >
                <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                  <c.icon className="h-4 w-4 text-gray-600" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-gray-900">{c.label}</span>
                    <span className="text-[11px] font-bold text-gray-500 tabular-nums">
                      {c.count}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 mt-0.5 leading-snug">{c.what}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center py-2">
            <ArrowDown className="h-4 w-4 text-gray-300" />
          </div>

          {/* ------------------------------------------- outcome + learn loop */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="flex items-center gap-2">
                <Webhook className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-bold text-blue-700">Webhook</span>
              </div>
              <p className="text-[11px] text-gray-600 mt-1.5 leading-snug">
                Razorpay confirms the payment. Signature-verified and idempotent, so a
                replayed event can never double-count.
              </p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <div className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-green-600" />
                <span className="text-xs font-bold text-green-700">Case resolved</span>
              </div>
              <p className="text-[11px] text-gray-600 mt-1.5 leading-snug">
                Pending actions are cancelled and the money is booked as recovered.
              </p>
              <p className="text-[11px] font-bold text-green-700 mt-1.5 tabular-nums">
                {paid} paid · {money(recovered)} recovered
              </p>
            </div>
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-violet-600" />
                <span className="text-xs font-bold text-violet-700">Learn</span>
              </div>
              <p className="text-[11px] text-gray-600 mt-1.5 leading-snug">
                Win-rate per strategy is recorded and feeds stage 4 on the next sweep —
                the loop closes back on itself.
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-gray-400">
            <RefreshCw className="h-3 w-3" />
            outcomes feed back into stage 4 — every sweep is better informed than the last
          </div>
        </div>
      )}
    </div>
  );
}

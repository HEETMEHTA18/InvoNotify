import { useState } from "react";
import { BrainCircuit, Clock3, Loader2, ShieldCheck, ShieldAlert, Sparkles, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type RecoveryAction = { id: number; actionType: string; channel: string | null; reason: string | null; urgency: string | null; confidence: number | null; policyResult: string; policyReasons: unknown; approvalRequired: boolean; status: string; executionStatus: string | null; failureReason: string | null; fallbackUsed: boolean; provider: string | null; payload: unknown; createdAt: string; completedAt: string | null };
type CaseDetailPayload = {
  id: number; status: string; stage: string; riskScore: number; paymentProbability: number; amountAtRisk: number; recoveredAmount: number; expectedRecovery: number; lastDecision: string | null; nextActionAt: string | null;
  invoice: { invoiceNumber: string; clientName: string; clientEmail: string; amount: number; amountPaid: number; balance: number; currency: string; status: string; dueDate: string | null; daysOverdue: number };
  actions: RecoveryAction[];
};

function riskLabel(score: number) { return score >= .7 ? { label: "HIGH RISK", cls: "bg-red-100 text-red-700" } : score >= .4 ? { label: "MEDIUM RISK", cls: "bg-amber-100 text-amber-700" } : { label: "LOW RISK", cls: "bg-green-100 text-green-700" }; }
function policyIcon(result: string) { return result === "ALLOW" ? <ShieldCheck className="h-4 w-4 text-green-600" /> : result === "REQUIRE_HUMAN_APPROVAL" ? <ShieldAlert className="h-4 w-4 text-orange-600" /> : <XCircle className="h-4 w-4 text-red-600" />; }
function isSimulation(a: RecoveryAction) { return a.status === "SIMULATED" || a.executionStatus === "SIMULATED" || a.provider === "simulation" || Boolean(a.payload && typeof a.payload === "object" && (a.payload as Record<string, unknown>).dryRun === true); }
function reasons(value: unknown) { return Array.isArray(value) ? value.map(String).filter(Boolean) : []; }
function actionName(value: string) { return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function statusClass(a: RecoveryAction) { return isSimulation(a) ? "bg-slate-100 text-slate-700" : ["EXECUTED", "SCHEDULED", "SUCCEEDED"].includes(a.status) ? "bg-green-50 text-green-700" : ["FAILED", "BLOCKED"].includes(a.status) ? "bg-red-50 text-red-700" : ["PENDING", "PENDING_APPROVAL"].includes(a.status) ? "bg-orange-50 text-orange-700" : "bg-gray-100 text-gray-600"; }

export function RecoveryCaseDetail({ open, onClose, detail, onApprove }: { open: boolean; onClose: () => void; detail: CaseDetailPayload | null; loading?: boolean; onApprove: (caseId: number) => Promise<void> }) {
  const [approving, setApproving] = useState(false);
  if (!detail) return null;
  const risk = riskLabel(detail.riskScore);
  const { invoice } = detail;
  const pendingAction = detail.actions.find((action) => action.status === "PENDING");
  const pendingApproval = detail.status === "AWAITING_APPROVAL" && pendingAction;
  const latestAction = detail.actions[0];
  const activity = detail.actions.filter((action, index, all) => all.findIndex((candidate) => [candidate.actionType, candidate.channel, candidate.policyResult, candidate.status, candidate.reason].join("|") === [action.actionType, action.channel, action.policyResult, action.status, action.reason].join("|")) === index).slice(0, 3);
  const approve = async () => { setApproving(true); try { await onApprove(detail.id); } finally { setApproving(false); } };

  return <Dialog open={open} onOpenChange={(visible) => !visible && onClose()}>
    <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center justify-between gap-3"><span>Recovery plan for {invoice.invoiceNumber}</span><span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${risk.cls}`}>{risk.label}</span></DialogTitle>
        <DialogDescription>Decision evidence, safety checks, and the next monitored step — without raw system payloads.</DialogDescription>
      </DialogHeader>
      <div className="space-y-5 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-500 uppercase tracking-wide">Customer &amp; invoice</p><p className="font-semibold text-gray-900 mt-1">{invoice.clientName}</p><p className="text-xs text-gray-500">{invoice.clientEmail}</p><p className="text-xs text-gray-600 mt-3"><span className="font-semibold">{invoice.invoiceNumber}</span> · {invoice.daysOverdue} days overdue · {invoice.status}</p></div>
          <div className="rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-500 uppercase tracking-wide">Recovery opportunity</p><p className="text-2xl font-bold text-gray-900 mt-1">₹{invoice.balance.toLocaleString("en-IN")}</p><p className="text-xs text-gray-500">outstanding in {invoice.currency}</p><p className="text-xs text-emerald-700 mt-3">₹{detail.recoveredAmount.toLocaleString("en-IN")} confirmed cash recovered</p></div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-white to-slate-50 p-4">
          <div className="flex items-center gap-2 mb-3"><BrainCircuit className="h-4 w-4 text-violet-600" /><p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">AI assessment</p></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3"><Metric label="Payment risk" value={`${Math.round(detail.riskScore * 100)}%`} color="text-gray-900" /><Metric label="Payment probability" value={`${Math.round(detail.paymentProbability * 100)}%`} color="text-green-600" /><Metric label="Expected recovery" value={`₹${Math.round(detail.expectedRecovery).toLocaleString("en-IN")}`} color="text-blue-600" /><Metric label="Safety status" value={detail.status.replace(/_/g, " ")} color="text-violet-700" small /></div>
        </div>
        {latestAction && <div className="rounded-xl border border-violet-200 bg-violet-50 p-4"><div className="flex items-start gap-3"><Sparkles className="h-5 w-5 text-violet-600 mt-0.5 shrink-0" /><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-violet-900 uppercase tracking-wide">AI recommendation</p><div className="flex flex-wrap items-center gap-2 mt-1"><p className="text-base font-bold text-gray-900">{actionName(latestAction.actionType)}</p>{latestAction.channel && <span className="text-xs font-medium text-violet-800">via {latestAction.channel}</span>}<span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusClass(latestAction)}`}>{isSimulation(latestAction) ? "Safe simulation" : latestAction.status}</span></div><p className="text-sm text-violet-950 mt-2">{latestAction.reason || "The agent selected the least intrusive recovery action permitted by policy."}</p><p className="text-xs text-violet-800 mt-2 flex gap-1.5"><ShieldCheck className="h-3.5 w-3.5 shrink-0" />{reasons(latestAction.policyReasons).join(" · ") || "Policy checks passed."}</p>{isSimulation(latestAction) && <p className="text-xs text-slate-600 mt-2">Demo mode: no provider request, payment link, email, or customer contact was sent.</p>}</div></div></div>}
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4"><p className="text-xs font-semibold text-sky-950 uppercase tracking-wide">How the agent helps</p><div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-xs"><Help title="Right tone, right time">Payment history and due age avoid treating a reliable payer like a high-risk defaulter.</Help><Help title="Least intrusive action">The agent starts with the lightest allowed step, then requests approval or escalates when risk or value requires a human.</Help><Help title="Continuous safety">Every scheduled sweep re-checks payment, dispute, consent, cooldown, and contact limits before an action can proceed.</Help></div></div>
        <div><div className="flex items-center justify-between mb-2 gap-3"><p className="text-xs text-gray-500 uppercase tracking-wide">Readable audit history</p>{detail.actions.length > activity.length && <span className="text-[11px] text-gray-500">{detail.actions.length - activity.length} repeated safe run(s) grouped</span>}</div><div className="space-y-2">{activity.length === 0 && <p className="text-xs text-gray-400 italic">No actions recorded yet.</p>}{activity.map((action) => <div key={action.id} className="rounded-lg border border-gray-200 p-3 flex items-start gap-3"><div className="mt-0.5">{policyIcon(action.policyResult)}</div><div className="flex-1 min-w-0"><div className="flex items-center justify-between gap-2"><p className="font-semibold text-gray-900">{actionName(action.actionType)}{action.channel && <span className="ml-2 text-xs font-normal text-gray-500">via {action.channel}</span>}</p><span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusClass(action)}`}>{isSimulation(action) ? "SAFE SIMULATION" : action.status}</span></div>{action.reason && <p className="text-xs text-gray-600 mt-1">{action.reason}</p>}{reasons(action.policyReasons).length > 0 && <p className="text-xs text-gray-500 mt-1">Policy: {reasons(action.policyReasons).join(" · ")}</p>}{action.failureReason && <p className="text-xs text-red-600 mt-1">Failure: {action.failureReason}</p>}{action.fallbackUsed && <p className="text-xs text-amber-600 mt-1">Fallback channel used</p>}</div></div>)}</div></div>
        <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600"><Clock3 className="h-4 w-4 text-gray-500 shrink-0" /><p>{detail.nextActionAt ? <>Next reassessment: <span className="font-semibold text-gray-800">{new Date(detail.nextActionAt).toLocaleString()}</span>. The agent stops automatically if the invoice is paid, disputed, opted out, or outside policy.</> : <>This case is monitored by scheduled recovery sweeps and payment webhooks. Any future action must pass the policy gate again.</>}</p></div>
        {pendingApproval && <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-orange-800">Human approval required</p><p className="text-xs text-orange-700 mt-0.5">{reasons(pendingAction.policyReasons).join(" · ") || "This action exceeds automatic approval limits."}</p></div><Button variant="default" size="sm" onClick={approve} disabled={approving} className="gap-2 shrink-0">{approving && <Loader2 className="h-4 w-4 animate-spin" />}Approve &amp; Execute</Button></div>}
      </div>
    </DialogContent>
  </Dialog>;
}

function Metric({ label, value, color, small }: { label: string; value: string; color: string; small?: boolean }) { return <div><p className={`${small ? "text-sm" : "text-xl"} font-bold ${color} break-words`}>{value}</p><p className="text-[11px] text-gray-500 mt-0.5">{label}</p></div>; }
function Help({ title, children }: { title: string; children: React.ReactNode }) { return <div><p className="font-semibold text-sky-950">{title}</p><p className="text-sky-800 mt-1 leading-relaxed">{children}</p></div>; }

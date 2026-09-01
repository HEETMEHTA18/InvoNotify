import { ChevronRight, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export type RecoveryCaseItem = {
  id: number;
  invoiceId: number;
  invoiceNumber: string;
  clientName: string;
  amountDue: number;
  currency: string;
  daysOverdue: number;
  riskScore: number;
  expectedRecovery: number;
  status: string;
  stage: string;
  lastDecision: string | null;
  lastActionStatus: string | null;
  lastActionType: string | null;
};

function riskBadge(score: number) {
  if (score >= 0.7)
    return { label: "HIGH", cls: "bg-red-100 text-red-700" };
  if (score >= 0.4)
    return { label: "MEDIUM", cls: "bg-amber-100 text-amber-700" };
  return { label: "LOW", cls: "bg-green-100 text-green-700" };
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    OPEN: "bg-gray-100 text-gray-700",
    CONTACTED: "bg-blue-100 text-blue-700",
    ESCALATED: "bg-purple-100 text-purple-700",
    AWAITING_APPROVAL: "bg-orange-100 text-orange-700",
    BLOCKED: "bg-red-100 text-red-700",
    PAID: "bg-green-100 text-green-700",
    CLOSED: "bg-gray-100 text-gray-500",
  };
  return map[status] || "bg-gray-100 text-gray-600";
}

export function RecoveryCaseList({
  cases,
  onSelect,
}: {
  cases: RecoveryCaseItem[];
  onSelect: (c: RecoveryCaseItem) => void;
}) {
  if (cases.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center">
        <ShieldAlert className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-700">
          No recovery cases yet
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Click &quot;Run Recovery&quot; to score your overdue invoices and let
          the agent recommend actions.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
          AI Recovery Cases
        </h3>
        <span className="text-xs text-gray-500">{cases.length} shown</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
              <th className="px-6 py-3 font-medium">Invoice</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Amount Due</th>
              <th className="px-4 py-3 font-medium">Risk</th>
              <th className="px-4 py-3 font-medium">AI Decision</th>
              <th className="px-4 py-3 font-medium">Policy</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Review</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {cases.map((c) => {
              const risk = riskBadge(c.riskScore);
              const pendingApproval = c.status === "AWAITING_APPROVAL";
              return (
                <tr
                  key={c.id}
                  className="hover:bg-gray-50/60 transition-colors"
                >
                  <td className="px-6 py-3.5">
                    <p className="font-semibold text-gray-900">
                      {c.invoiceNumber}
                    </p>
                    <p className="text-xs text-gray-500">
                      {c.daysOverdue} day(s) overdue
                    </p>
                  </td>
                  <td className="px-4 py-3.5 text-gray-700">{c.clientName}</td>
                  <td className="px-4 py-3.5 font-semibold text-gray-900">
                    {c.currency} {c.amountDue.toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${risk.cls}`}
                    >
                      {risk.label} {Math.round(c.riskScore * 100)}%
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-gray-800 font-medium">
                      {c.lastDecision || "—"}
                    </span>
                    {c.lastActionStatus === "FAILED" && (
                      <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600">
                        FAILED
                      </span>
                    )}
                    {c.lastActionStatus === "EXECUTED" && (
                      <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-600">
                        DONE
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {pendingApproval ? (
                      <span className="inline-flex items-center gap-1 text-orange-600 text-xs font-semibold">
                        <ShieldAlert className="h-3.5 w-3.5" /> Approval
                        required
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">
                        {c.status === "BLOCKED" ? "Blocked" : "Allowed"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${statusBadge(c.status)}`}
                    >
                      {c.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSelect(c)}
                      className="gap-1 text-gray-600"
                    >
                      {pendingApproval ? "Approve" : "Review"}
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
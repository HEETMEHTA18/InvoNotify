import React from "react";
import { InvoiceActions } from "./InvoiceActions";
import { FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function InvoiceList({ invoices, onEdit, onDelete, onMarkPaid, onReminder, onSendSms, onVoiceCall, onDownload, onRecordPayment }: any) {
  // Safe date helper
  const formatDate = (dateString: any) => {
    if (!dateString) return "—";
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? "Invalid Date" : date.toLocaleDateString();
    } catch {
      return "Error";
    }
  };

  // Safe currency formatter
  const formatCurrency = (amount: any, currency: string = "INR") => {
    const symbol = currency === "INR" ? "₹" : (currency || "₹");
    return `${symbol}${parseFloat(amount || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  if (!invoices) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-40 mb-2" />
            <div className="flex justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Mobile View: Cards */}
      <div className="lg:hidden space-y-4 px-4 pb-6">
        {invoices.map((inv: any) => (
          <div key={inv.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm relative group transition-all hover:border-gray-300">
            <div className="flex justify-between items-start mb-3">
              <div>
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  {inv.invoiceNumber || `#${inv.id}`}
                </span>
                <h3 className="text-sm font-bold text-gray-900 mt-0.5 truncate max-w-[180px]">
                  {inv.clientName || inv.customer || "Unknown Client"}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                    inv.status === "Paid"
                      ? "bg-green-100 text-green-700"
                      : inv.status === "Pending" && inv.dueDate && new Date(inv.dueDate) < new Date()
                        ? "bg-red-100 text-red-700 font-black ring-1 ring-red-200"
                        : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {inv.status === "Pending" && inv.dueDate && new Date(inv.dueDate) < new Date() ? "OVERDUE" : (inv.status || "PENDING")}
                </span>
                <InvoiceActions
                  invoice={inv}
                  onEdit={() => onEdit && onEdit(inv)}
                  onDelete={() => onDelete && onDelete(inv)}
                  onMarkPaid={() => onMarkPaid && onMarkPaid(inv)}
                  onReminder={() => onReminder && onReminder(inv)}
                  onSendSms={() => onSendSms && onSendSms(inv)}
                  onVoiceCall={() => onVoiceCall && onVoiceCall(inv)}
                  onDownload={() => onDownload && onDownload(inv)}
                  onRecordPayment={() => onRecordPayment && onRecordPayment(inv)}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-y-3 gap-x-2 border-t border-gray-50 pt-3">
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase">Date</p>
                <p className="text-xs text-gray-700 font-medium">{formatDate(inv.date)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase text-right">Due Date</p>
                <p className="text-xs text-gray-700 font-medium text-right">{formatDate(inv.dueDate)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase">Total</p>
                <p className="text-sm text-gray-900 font-bold tracking-tight">{formatCurrency(inv.total || inv.amount, inv.currency)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase text-right">Balance</p>
                <p className={`text-sm font-bold text-right tracking-tight ${parseFloat(inv.balance?.toString() || "0") > 0 ? 'text-blue-600' : 'text-gray-900'}`}>
                   {formatCurrency(inv.balance?.toString() || inv.total || "0", inv.currency)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop View: Table */}
      <div className="hidden lg:block overflow-hidden border border-gray-200 rounded-xl shadow-sm bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr className="bg-gray-50/50">
              <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Invoice</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Client</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Total</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Balance</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Status</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Dates</th>
              <th className="px-6 py-4 text-right text-[10px] font-bold text-gray-500 uppercase tracking-widest">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {invoices.map((inv: any) => (
              <tr key={inv.id} className="hover:bg-gray-50/50 transition-colors group">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-bold text-gray-900">
                    {inv.invoiceNumber || `#${inv.id}`}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm font-semibold text-gray-900 leading-tight">
                    {inv.clientName || inv.customer || "Unknown Client"}
                  </div>
                  {inv.clientEmail && (
                    <div className="text-xs text-gray-500 mt-0.5">{inv.clientEmail}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-bold text-gray-900 tracking-tight">
                    {formatCurrency(inv.total || inv.amount, inv.currency)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className={`text-sm font-bold tracking-tight ${parseFloat(inv.balance?.toString() || "0") > 0 ? "text-blue-600" : "text-gray-900"}`}>
                    {formatCurrency(inv.balance?.toString() || inv.total || "0", inv.currency)}
                  </div>
                  {parseFloat(inv.amountPaid?.toString() || "0") > 0 && (
                    <div className="text-[10px] font-semibold text-green-600 uppercase tracking-wide mt-0.5 flex items-center gap-1">
                      <div className="h-1 w-1 bg-green-600 rounded-full" />
                      Paid: {formatCurrency(inv.amountPaid.toString(), inv.currency)}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      inv.status === "Paid"
                        ? "bg-green-100 text-green-700"
                        : inv.status === "Pending" && inv.dueDate && new Date(inv.dueDate) < new Date()
                          ? "bg-red-100 text-red-700 ring-1 ring-red-200"
                          : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {inv.status === "Pending" && inv.dueDate && new Date(inv.dueDate) < new Date()
                      ? "Overdue"
                      : inv.status || "Pending"}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                   <div className="flex flex-col items-center justify-center">
                      <p className="text-[10px] font-bold text-gray-400 leading-none mb-1 uppercase tracking-tighter">Issued</p>
                      <p className="text-xs font-medium text-gray-700 mb-2">{formatDate(inv.date)}</p>
                      <p className="text-[10px] font-bold text-gray-400 leading-none mb-1 uppercase tracking-tighter">Due</p>
                      <p className="text-xs font-bold text-red-500/80">{formatDate(inv.dueDate)}</p>
                   </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <InvoiceActions
                    invoice={inv}
                    onEdit={() => onEdit && onEdit(inv)}
                    onDelete={() => onDelete && onDelete(inv)}
                    onMarkPaid={() => onMarkPaid && onMarkPaid(inv)}
                    onReminder={() => onReminder && onReminder(inv)}
                    onSendSms={() => onSendSms && onSendSms(inv)}
                    onVoiceCall={() => onVoiceCall && onVoiceCall(inv)}
                    onDownload={() => onDownload && onDownload(inv)}
                    onRecordPayment={() => onRecordPayment && onRecordPayment(inv)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {invoices.length === 0 && (
        <div className="text-center bg-white border border-gray-200 rounded-xl py-16 shadow-sm">
          <div className="h-16 w-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
            <FileText className="h-8 w-8 text-gray-300" />
          </div>
          <h3 className="text-gray-900 font-bold">No Invoices Yet</h3>
          <p className="text-gray-500 text-sm mt-1">Ready to create your first client invoice?</p>
        </div>
      )}
    </div>
  );
}

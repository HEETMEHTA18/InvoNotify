import React from "react";
import { InvoiceActions } from "./InvoiceActions";
import { FileText } from "lucide-react";

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

  // Safe invoice check
  if (!invoices) {
    return <div className="p-8 text-center text-gray-500">Loading invoices...</div>;
  }

  return (
    <div className="overflow-hidden border-b border-gray-200 shadow sm:rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Invoice
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Client
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Total
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Balance
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Date
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Due Date
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {invoices.map((inv: any) => (
            <tr key={inv.id || Math.random()} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">
                  {inv.invoiceNumber || `#${inv.id}`}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">
                  {inv.clientName || inv.customer || "Unknown Client"}
                </div>
                {inv.clientEmail && (
                  <div className="text-xs text-gray-500">{inv.clientEmail}</div>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">
                  {inv.currency === "INR" ? "₹" : (inv.currency || "₹")}{parseFloat(inv.total || inv.amount || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">
                  {inv.currency === "INR" ? "₹" : (inv.currency || "₹")}{parseFloat(inv.balance?.toString() || inv.total || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                {parseFloat(inv.amountPaid?.toString() || "0") > 0 && (
                  <div className="text-xs text-green-600">Paid: {inv.currency === "INR" ? "₹" : inv.currency}{parseFloat(inv.amountPaid.toString()).toLocaleString()}</div>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${inv.status === "Paid"
                    ? "bg-green-100 text-green-800"
                    : inv.status === "Pending" && inv.dueDate && new Date(inv.dueDate) < new Date()
                      ? "bg-red-100 text-red-800"
                      : "bg-yellow-100 text-yellow-800"
                    }`}
                >
                  {inv.status === "Pending" && inv.dueDate && new Date(inv.dueDate) < new Date()
                    ? "Overdue"
                    : inv.status || "Pending"}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatDate(inv.date)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatDate(inv.dueDate)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
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
          {invoices.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center text-gray-400 py-12">
                <div className="flex flex-col items-center gap-2">
                  <FileText className="h-10 w-10 text-gray-300" />
                  <p>No invoices found. Create your first invoice!</p>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

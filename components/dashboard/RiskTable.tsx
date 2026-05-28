"use client";

import { AlertCircle, ArrowRight, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface RiskCustomer {
  name: string;
  email: string;
  totalOverdue: number;
  count: number;
  lastInvoiceId: number | null;
}

export function RiskTable({ customers }: { customers: RiskCustomer[] }) {
  const router = useRouter();
  const [sendingId, setSendingId] = useState<number | null>(null);

  const handleSendReminder = async (invoiceId: number | null) => {
    if (!invoiceId) return;
    try {
      setSendingId(invoiceId);
      const res = await fetch("/api/reminders/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const data = await res.json();
      if (res.ok) {
        alert("Reminder sent successfully!");
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error(error);
      alert("Failed to send reminder.");
    } finally {
      setSendingId(null);
    }
  };

  if (!customers || customers.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
        <div className="h-12 w-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
          <AlertCircle className="h-6 w-6 text-green-600" />
        </div>
        <h3 className="text-lg font-medium text-gray-900">Low Risk</h3>
        <p className="text-sm text-gray-500 mt-1">
          No customers with overdue payments found.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-red-50/30">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <h2 className="font-semibold text-gray-900">High Risk Customers</h2>
        </div>
        <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-red-100 text-red-700">
          Overdue Payments
        </span>
      </div>

      <div className="overflow-x-auto flex-1">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-6 py-3 font-medium">Customer</th>
              <th className="px-6 py-3 font-medium text-right">
                Overdue Amount
              </th>
              <th className="px-6 py-3 font-medium text-center">Invoices</th>
              <th className="px-6 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {customers.map((customer, i) => (
              <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-900">
                    {customer.name}
                  </div>
                  <div className="text-xs text-gray-500">{customer.email}</div>
                </td>
                <td className="px-6 py-4 text-right font-bold text-red-600">
                  ₹{customer.totalOverdue?.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-center">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700">
                    {customer.count} Overdue
                  </span>
                </td>
                <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                  {customer.lastInvoiceId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => handleSendReminder(customer.lastInvoiceId)}
                      disabled={sendingId === customer.lastInvoiceId}
                    >
                      {sendingId === customer.lastInvoiceId ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Mail className="h-3 w-3 sm:mr-1.5" />
                      )}
                      <span className="hidden sm:inline">Remind</span>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    onClick={() =>
                      router.push(
                        `/dashboard/invoices?search=${encodeURIComponent(customer.name)}`,
                      )
                    }
                  >
                    View <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

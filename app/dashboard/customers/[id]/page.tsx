"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CibilMeter } from "@/components/customers/CibilMeter";

type InvoiceHistory = {
  id: number;
  invoiceNumber: string;
  status: string;
  overdueDays?: number;
  date: string;
  dueDate: string | null;
  total: string | number;
  amountPaid: string | number;
  balance: string | number;
};

type CustomerDetails = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  openingBalance: string | number;
  cibilScore: number;
  createdAt: string;
  invoices: InvoiceHistory[];
};

function getRiskBand(score: number) {
  if (score < 650) return { label: "Risky", className: "bg-red-100 text-red-700" };
  if (score >= 750) return { label: "Good", className: "bg-green-100 text-green-700" };
  return { label: "Moderate", className: "bg-amber-100 text-amber-700" };
}

function amount(value: string | number) {
  const num = Number(value || 0);
  return `INR ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CustomerProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [customer, setCustomer] = useState<CustomerDetails | null>(null);

  async function fetchCustomer() {
    try {
      setLoading(true);
      const res = await fetch(`/api/customers/${params.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load customer profile");
      setCustomer(data);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to load customer");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (params.id) {
      fetchCustomer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const historyTotals = useMemo(() => {
    if (!customer) return { totalInvoiced: 0, totalPaid: 0, totalBalance: 0 };

    return customer.invoices.reduce(
      (acc, invoice) => {
        acc.totalInvoiced += Number(invoice.total || 0);
        acc.totalPaid += Number(invoice.amountPaid || 0);
        acc.totalBalance += Number(invoice.balance || 0);
        return acc;
      },
      { totalInvoiced: 0, totalPaid: 0, totalBalance: 0 }
    );
  }, [customer]);

  async function handleDownloadPdf() {
    if (!customer) return;

    try {
      setDownloading(true);
      const res = await fetch(`/api/customers/export?customerId=${customer.id}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to export customer history PDF");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${customer.name.replace(/\s+/g, "-").toLowerCase()}-history.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to export PDF");
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-sm text-red-600">Customer not found.</p>
      </div>
    );
  }

  const risk = getRiskBand(customer.cibilScore || 650);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/customers")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
            <p className="text-sm text-gray-500">Customer profile and complete history with the shop</p>
          </div>
        </div>

        <Button onClick={handleDownloadPdf} className="bg-gray-900 hover:bg-gray-800 text-white" disabled={downloading}>
          {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          Download PDF
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Profile</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <p><span className="text-gray-500">Email:</span> {customer.email || "-"}</p>
            <p><span className="text-gray-500">Phone:</span> {customer.phone || "-"}</p>
            <p><span className="text-gray-500">City:</span> {customer.city || "-"}</p>
            <p><span className="text-gray-500">State:</span> {customer.state || "-"}</p>
            <p className="sm:col-span-2"><span className="text-gray-500">Address:</span> {customer.address || "-"}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">CIBIL Score</h2>
          <div className="flex justify-center">
            <CibilMeter score={customer.cibilScore || 650} size={180} />
          </div>
          <span className={`inline-flex mt-3 px-2 py-1 rounded text-xs font-semibold ${risk.className}`}>
            {risk.label}
          </span>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Summary</h2>
          <p className="text-sm text-gray-600">Opening Balance</p>
          <p className="text-lg font-bold text-gray-900">{amount(customer.openingBalance)}</p>
          <p className="text-sm text-gray-600 mt-2">Total Invoices</p>
          <p className="text-lg font-bold text-gray-900">{customer.invoices.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Invoiced</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{amount(historyTotals.totalInvoiced)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Paid</p>
          <p className="text-xl font-bold text-green-700 mt-1">{amount(historyTotals.totalPaid)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Outstanding</p>
          <p className="text-xl font-bold text-red-700 mt-1">{amount(historyTotals.totalBalance)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">History and Records</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/60 border-b border-gray-100">
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Invoice</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Due</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Total</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Paid</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customer.invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-gray-500">
                    No history available yet.
                  </td>
                </tr>
              ) : (
                customer.invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{invoice.invoiceNumber || `#${invoice.id}`}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{new Date(invoice.date).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "-"}</td>
                    <td className="px-5 py-3 text-sm">
                      <span className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${
                        invoice.status === "Paid"
                          ? "bg-green-100 text-green-700"
                          : invoice.status === "Overdue"
                            ? "bg-red-100 text-red-700"
                            : "bg-blue-100 text-blue-700"
                      }`}>
                        {invoice.status}
                      </span>
                      {invoice.status === "Overdue" && (invoice.overdueDays || 0) > 0 ? (
                        <span className="ml-2 text-xs text-red-600 font-medium">{invoice.overdueDays}d overdue</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-sm text-right text-gray-900">{amount(invoice.total)}</td>
                    <td className="px-5 py-3 text-sm text-right text-green-700">{amount(invoice.amountPaid)}</td>
                    <td className="px-5 py-3 text-sm text-right text-red-700">{amount(invoice.balance)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

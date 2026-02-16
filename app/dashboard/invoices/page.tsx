"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { InvoiceList } from "./InvoiceList";
import { useRouter } from "next/navigation";
import {
  FileText,
  Plus,
  Loader2,
  RefreshCw,
  Search,
  Filter,
  Banknote,
  AlertTriangle,
} from "lucide-react";

type InvoiceItem = {
  id: number;
  description: string;
  quantity: number;
  rate: string;
  amount: string;
};

type Invoice = {
  id: number;
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  clientAddress: string;
  senderName: string;
  senderEmail: string;
  senderAddress: string;
  total: string;
  subtotal: string;
  status: string;
  date: string;
  dueDate: string | null;
  currency: string;
  note: string;
  customer: string;
  amount: string;
  items: InvoiceItem[];
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const router = useRouter();

  const fetchInvoices = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/invoices");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setInvoices(data);
      setFilteredInvoices(data);
    } catch {
      setError("Failed to load invoices. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Filter & search
  useEffect(() => {
    let result = invoices;

    if (statusFilter !== "all") {
      result = result.filter((inv) => inv.status === statusFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (inv) =>
          (inv.clientName || inv.customer || "").toLowerCase().includes(q) ||
          (inv.invoiceNumber || "").toLowerCase().includes(q) ||
          (inv.clientEmail || "").toLowerCase().includes(q)
      );
    }

    setFilteredInvoices(result);
  }, [search, statusFilter, invoices]);

  // Stats
  const totalRevenue = invoices.reduce((s, inv) => s + parseFloat(inv.total || inv.amount || "0"), 0);
  const paidCount = invoices.filter((inv) => inv.status === "Paid").length;
  const pendingCount = invoices.filter((inv) => inv.status === "Pending").length;

  async function handleDelete(inv: Invoice) {
    if (!confirm(`Delete invoice ${inv.invoiceNumber || `#${inv.id}`}?`)) return;
    try {
      await fetch(`/api/invoices/${inv.id}`, { method: "DELETE" });
      fetchInvoices();
    } catch {
      setError("Failed to delete invoice");
    }
  }

  async function handleMarkPaid(inv: Invoice) {
    try {
      await fetch(`/api/invoices/${inv.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Paid" }),
      });
      fetchInvoices();
    } catch {
      setError("Failed to update invoice");
    }
  }

  async function handleReminder(inv: Invoice) {
    try {
      const res = await fetch(`/api/invoices/${inv.id}/reminder`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || `Reminder sent to ${inv.clientName || inv.customer}`);
      } else {
        alert(data.error || "Failed to send reminder");
      }
    } catch {
      alert("Failed to send reminder email");
    }
  }

  function handleDownload(inv: Invoice) {
    // Navigate to create page with pre-filled data for PDF generation
    alert(`Download for invoice ${inv.invoiceNumber || `#${inv.id}`}`);
  }

  function handleEdit(inv: Invoice) {
    // For now, navigate to the invoice detail
    alert(`Edit invoice ${inv.invoiceNumber || `#${inv.id}`}`);
  }

  return (
    <div className="max-w-6xl mx-auto py-6">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
            <FileText className="h-5 w-5 text-gray-900" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
            <p className="text-sm text-gray-500">Manage and track all your invoices</p>
          </div>
        </div>
        <Button
          onClick={() => router.push("/dashboard/invoices/create")}
          className="bg-gray-900 hover:bg-gray-800 text-white font-medium px-5 py-2.5 rounded-lg flex items-center gap-2 shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Create Invoice
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Invoices</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{invoices.length}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-gray-50 flex items-center justify-center">
              <FileText className="h-5 w-5 text-gray-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Paid / Pending</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                <span className="text-green-600">{paidCount}</span>
                <span className="text-gray-400 mx-1">/</span>
                <span className="text-yellow-600">{pendingCount}</span>
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-gray-50 flex items-center justify-center">
              <Filter className="h-5 w-5 text-gray-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Revenue</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                ₹{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-gray-50 flex items-center justify-center">
              <Banknote className="h-5 w-5 text-gray-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 p-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by client name, email, or invoice number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            />
          </div>
          {/* Status filter */}
          <div className="flex items-center gap-2">
            {["all", "Pending", "Paid"].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${statusFilter === status
                  ? "bg-gray-900 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
              >
                {status === "all" ? "All" : status}
              </button>
            ))}
          </div>
          {/* Refresh */}
          <button
            onClick={fetchInvoices}
            disabled={isLoading}
            className="p-2.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Invoice Table */}
        {error && (
          <div className="mx-4 mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {error}
            <button
              onClick={fetchInvoices}
              className="ml-auto text-red-600 hover:text-red-800 underline text-xs"
            >
              Retry
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-3" />
            <p className="text-sm text-gray-500">Loading invoices...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <InvoiceList
              invoices={filteredInvoices}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onMarkPaid={handleMarkPaid}
              onReminder={handleReminder}
              onDownload={handleDownload}
            />
          </div>
        )}
      </div>
    </div>
  );
}

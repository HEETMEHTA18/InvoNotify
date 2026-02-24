"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { InvoiceList } from "./InvoiceList";
import { PaymentDialog } from "./PaymentDialog";
import { generateInvoicePDF } from "@/app/utils/pdfGenerator";
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
  amountPaid?: string;
  balance?: string;
  items?: InvoiceItem[];
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<Invoice | null>(null);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tallyFileInputRef = useRef<HTMLInputElement>(null);
  const customerFileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const fetchInvoices = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/invoices?withItems=false");
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

  async function handleBulkImport(e: React.ChangeEvent<HTMLInputElement>, type: 'invoice' | 'customer') {
    const file = e.target.files?.[0];
    if (!file) return;

    const endpoint = type === 'customer' ? "/api/customers/bulk-import" : "/api/invoices/bulk-import";

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      setIsLoading(true);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          body: content,
        });
        const result = await res.json();
        if (res.ok) {
          alert(`Import successful: ${result.createdCount} records created.`);
          if (type === 'invoice') fetchInvoices();
        } else {
          alert(`Import failed: ${result.error || "Unknown error"}`);
        }
      } catch (err) {
        alert("Import failed. See console.");
        console.error(err);
      } finally {
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (customerFileInputRef.current) customerFileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  }

  async function handleTallyImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      setIsLoading(true);
      try {
        const res = await fetch("/api/invoices/bulk-import", {
          method: "POST",
          body: content,
        });
        const result = await res.json();
        if (res.ok) {
          alert(`Tally import successful: ${result.createdCount} invoices created.`);
          fetchInvoices();
        } else {
          alert(`Tally import failed: ${result.error || "Unknown error"}`);
        }
      } catch (err) {
        alert("Tally import failed. See console.");
        console.error(err);
      } finally {
        setIsLoading(false);
        if (tallyFileInputRef.current) tallyFileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  }

  // Filter & search
  useEffect(() => {
    let result = invoices;
    const now = new Date();

    if (statusFilter !== "all") {
      if (statusFilter === "Overdue") {
        result = result.filter((inv) =>
          inv.status === "Pending" && inv.dueDate && new Date(inv.dueDate) < now
        );
      } else {
        result = result.filter((inv) => inv.status === statusFilter);
      }
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

  const { totalRevenue, paidCount, overdueCount } = useMemo(() => {
    const currentDate = new Date();

    return {
      totalRevenue: invoices.reduce((s, inv) => s + parseFloat(inv.total || inv.amount || "0"), 0),
      paidCount: invoices.filter((inv) => inv.status === "Paid").length,
      overdueCount: invoices.filter((inv) =>
        inv.status === "Pending" && inv.dueDate && new Date(inv.dueDate) < currentDate
      ).length,
    };
  }, [invoices]);

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

  const [settings, setSettings] = useState<{ logo: string | null; signature: string | null } | undefined>();

  async function getSettingsForPdf() {
    if (settings !== undefined) return settings;

    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");

      const data = await res.json();
      setSettings(data);
      return data;
    } catch (e) {
      console.error("Settings load failed:", e);
      return undefined;
    }
  }

  async function fetchInvoiceDetailsForDownload(invoiceId: number) {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`);
      if (!res.ok) throw new Error("Failed to fetch invoice details");
      return await res.json();
    } catch (e) {
      console.error("Invoice details load failed:", e);
      return null;
    }
  }

  async function handleDownload(inv: Invoice) {
    try {
      const [invoiceData, settingsData] = await Promise.all([
        inv.items?.length ? Promise.resolve(inv) : fetchInvoiceDetailsForDownload(inv.id),
        getSettingsForPdf(),
      ]);

      if (!invoiceData) {
        alert("Failed to load invoice details");
        return;
      }

      generateInvoicePDF(invoiceData, settingsData);
    } catch (e) {
      console.error("PDF generation error:", e);
      alert("Failed to generate PDF");
    }
  }

  function handleEdit(inv: Invoice) {
    router.push(`/dashboard/invoices/create?invoiceId=${inv.id}`);
  }

  function handleRecordPayment(inv: Invoice) {
    setSelectedInvoiceForPayment(inv);
    setIsPaymentDialogOpen(true);
  }

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 md:px-6">
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
        <div className="flex gap-2">
          <input
            type="file"
            accept=".yml,.yaml,.json"
            className="hidden"
            ref={fileInputRef}
            onChange={(e) => handleBulkImport(e, 'invoice')}
          />
          <input
            type="file"
            accept=".xml,.yml,.yaml"
            className="hidden"
            ref={tallyFileInputRef}
            onChange={handleTallyImport}
          />
          <input
            type="file"
            accept=".yml,.yaml,.json"
            className="hidden"
            ref={customerFileInputRef}
            onChange={(e) => handleBulkImport(e, 'customer')}
          />
          <Button
            onClick={() => tallyFileInputRef.current?.click()}
            className="bg-white border border-gray-200 text-purple-600 hover:bg-purple-50 font-medium px-4 py-2.5 rounded-lg flex items-center gap-2 shadow-sm"
            disabled={isLoading}
          >
            <FileText className="h-4 w-4" />
            Import from Tally
          </Button>
          <Button
            onClick={() => customerFileInputRef.current?.click()}
            className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium px-4 py-2.5 rounded-lg flex items-center gap-2 shadow-sm"
            disabled={isLoading}
          >
            <FileText className="h-4 w-4" />
            Import Customers
          </Button>
          <Button
            onClick={() => fileInputRef.current?.click()}
            className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium px-4 py-2.5 rounded-lg flex items-center gap-2 shadow-sm"
            disabled={isLoading}
          >
            <FileText className="h-4 w-4" />
            Import Invoices
          </Button>
          <Button
            onClick={() => router.push("/dashboard/invoices/create")}
            className="bg-gray-900 hover:bg-gray-800 text-white font-medium px-5 py-2.5 rounded-lg flex items-center gap-2 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Create Invoice
          </Button>
        </div>
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
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Paid / Overdue</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                <span className="text-green-600">{paidCount}</span>
                <span className="text-gray-400 mx-1">/</span>
                <span className="text-red-600">{overdueCount}</span>
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
            {["all", "Pending", "Paid", "Overdue"].map((status) => (
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
              onRecordPayment={handleRecordPayment}
            />
          </div>
        )}
      </div>

      <PaymentDialog
        isOpen={isPaymentDialogOpen}
        onClose={() => setIsPaymentDialogOpen(false)}
        invoice={selectedInvoiceForPayment}
        onSuccess={fetchInvoices}
      />
    </div>
  );
}

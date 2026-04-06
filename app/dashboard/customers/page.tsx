"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  ArrowUpRight,
  Download,
  Pencil,
  FileText,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CibilMeter } from "@/components/customers/CibilMeter";

type Customer = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  openingBalance: string | number;
  cibilScore: number;
  createdAt: string;
  overdueInvoiceCount?: number;
  maxOverdueDays?: number;
  totalInvoices?: number;
  totalOutstanding?: number;
};

type ImportResult = {
  message?: string;
  createdCount?: number;
  errors?: Array<{ name?: string; error?: string }>;
  error?: string;
};

function getRiskBand(score: number) {
  if (score < 650) return { label: "Risky", className: "bg-red-100 text-red-700" };
  if (score >= 750) return { label: "Good", className: "bg-green-100 text-green-700" };
  return { label: "Moderate", className: "bg-amber-100 text-amber-700" };
}

function formatCurrency(value: string | number | null | undefined) {
  const amount = Number(value || 0);
  return `INR ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [cibilScore, setCibilScore] = useState("650");

  const customerFileInputRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setName("");
    setEmail("");
    setPhone("");
    setCity("");
    setState("");
    setOpeningBalance("0");
    setCibilScore("650");
    setEditingCustomerId(null);
  }

  function openCreateModal() {
    resetForm();
    setOpenCreateDialog(true);
  }

  function openEditModal(customer: Customer) {
    setEditingCustomerId(customer.id);
    setName(customer.name || "");
    setEmail(customer.email || "");
    setPhone(customer.phone || "");
    setCity(customer.city || "");
    setState(customer.state || "");
    setOpeningBalance(String(Number(customer.openingBalance || 0)));
    setCibilScore(String(customer.cibilScore || 650));
    setOpenCreateDialog(true);
  }

  async function fetchCustomers() {
    try {
      setLoading(true);
      const res = await fetch("/api/customers");
      if (!res.ok) throw new Error("Failed to load customers");
      const data = await res.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load customers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return customers;

    return customers.filter((customer) => {
      return (
        customer.name.toLowerCase().includes(query) ||
        (customer.email || "").toLowerCase().includes(query) ||
        (customer.phone || "").toLowerCase().includes(query) ||
        (customer.city || "").toLowerCase().includes(query)
      );
    });
  }, [customers, search]);

  const riskyCustomers = useMemo(
    () => [...customers].filter((c) => c.cibilScore < 650).sort((a, b) => a.cibilScore - b.cibilScore),
    [customers]
  );

  const goodCustomers = useMemo(
    () => [...customers].filter((c) => c.cibilScore >= 750).sort((a, b) => b.cibilScore - a.cibilScore),
    [customers]
  );

  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      const isEditing = editingCustomerId !== null;
      const endpoint = isEditing ? `/api/customers/${editingCustomerId}` : "/api/customers";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          city,
          state,
          openingBalance: Number(openingBalance || 0),
          cibilScore: Number(cibilScore || 650),
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result?.error || "Failed to create customer");
      }

      toast.success(isEditing ? "Customer updated" : "Customer created");
      setOpenCreateDialog(false);
      resetForm();
      fetchCustomers();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to save customer");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteCustomer(customer: Customer) {
    const ok = confirm(`Delete customer ${customer.name}? This cannot be undone.`);
    if (!ok) return;

    try {
      const res = await fetch(`/api/customers/${customer.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to delete customer");
      }

      toast.success("Customer deleted");
      fetchCustomers();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to delete customer");
    }
  }

  async function handleCustomerImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = String(event.target?.result || "");

      try {
        setLoading(true);
        const res = await fetch("/api/customers/bulk-import", {
          method: "POST",
          body: content,
        });

        const result = (await res.json()) as ImportResult;
        if (!res.ok) {
          throw new Error(result.error || "Import failed");
        }

        const failed = result.errors?.length || 0;
        toast.success(`Imported ${result.createdCount || 0} customers${failed ? `, failed: ${failed}` : ""}`);
        fetchCustomers();
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Import failed");
      } finally {
        setLoading(false);
        if (customerFileInputRef.current) customerFileInputRef.current.value = "";
      }
    };

    reader.readAsText(file);
  }

  async function handleDownloadPdf() {
    try {
      setDownloadingPdf(true);
      const res = await fetch("/api/customers/export");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to download PDF");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `customers-report-${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to download PDF");
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
              <Users className="h-5 w-5 text-gray-900" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
              <p className="text-sm text-gray-500">Manage customer profile, CIBIL score, and account history</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept=".yml,.yaml,.json"
              className="hidden"
              ref={customerFileInputRef}
              onChange={handleCustomerImport}
            />
            <Button
              onClick={() => customerFileInputRef.current?.click()}
              className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              disabled={loading}
            >
              <FileText className="h-4 w-4 mr-2" />
              Import Customers
            </Button>
            <Button
              onClick={handleDownloadPdf}
              className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              disabled={downloadingPdf}
            >
              {downloadingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Download PDF
            </Button>
            <Button onClick={openCreateModal} className="bg-gray-900 hover:bg-gray-800 text-white">
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <h2 className="text-sm font-semibold text-red-700 uppercase tracking-wide">Risky Customers</h2>
              </div>
              <span className="text-xs font-semibold px-2 py-1 rounded bg-red-100 text-red-700">{riskyCustomers.length}</span>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, idx) => (
                  <Skeleton key={idx} className="h-10 w-full" />
                ))}
              </div>
            ) : riskyCustomers.length === 0 ? (
              <p className="text-sm text-red-700/80">No risky customers based on CIBIL threshold.</p>
            ) : (
              <div className="space-y-2">
                {riskyCustomers.slice(0, 5).map((customer) => (
                  <Link
                    key={customer.id}
                    href={`/dashboard/customers/${customer.id}`}
                    className="flex items-center justify-between rounded-lg bg-white border border-red-100 px-3 py-2 hover:border-red-300 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {customer.name}
                      {(customer.overdueInvoiceCount || 0) > 0 ? (
                        <span className="ml-2 text-xs text-red-600">{customer.overdueInvoiceCount} overdue</span>
                      ) : null}
                    </span>
                    <span className="text-xs font-semibold text-red-700">CIBIL {customer.cibilScore}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-green-200 bg-green-50/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-green-600" />
                <h2 className="text-sm font-semibold text-green-700 uppercase tracking-wide">Good Customers</h2>
              </div>
              <span className="text-xs font-semibold px-2 py-1 rounded bg-green-100 text-green-700">{goodCustomers.length}</span>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, idx) => (
                  <Skeleton key={idx} className="h-10 w-full" />
                ))}
              </div>
            ) : goodCustomers.length === 0 ? (
              <p className="text-sm text-green-700/80">No good customers yet. Improve credit profile data.</p>
            ) : (
              <div className="space-y-2">
                {goodCustomers.slice(0, 5).map((customer) => (
                  <Link
                    key={customer.id}
                    href={`/dashboard/customers/${customer.id}`}
                    className="flex items-center justify-between rounded-lg bg-white border border-green-100 px-3 py-2 hover:border-green-300 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-900 truncate">{customer.name}</span>
                    <span className="text-xs font-semibold text-green-700">CIBIL {customer.cibilScore}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50/60">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer by name, email, phone, city"
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/60 border-b border-gray-100">
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">CIBIL</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Risk</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Opening Balance</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [...Array(6)].map((_, idx) => (
                  <tr key={idx}>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-40" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-14 w-20" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-5 w-16 rounded" /></td>
                    <td className="px-6 py-4 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    <td className="px-6 py-4 text-right"><Skeleton className="h-8 w-44 ml-auto rounded" /></td>
                  </tr>
                ))
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <p className="text-sm text-gray-500">No customers found.</p>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => {
                  const risk = getRiskBand(customer.cibilScore || 650);
                  return (
                    <tr key={customer.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{customer.name}</p>
                          <p className="text-xs text-gray-500">{[customer.city, customer.state].filter(Boolean).join(", ") || "No location"}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{customer.email || customer.phone || "-"}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                        <div className="flex items-center justify-center">
                          <CibilMeter score={customer.cibilScore || 650} size={90} compact />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${risk.className}`}>
                          {risk.label}
                        </span>
                        {(customer.overdueInvoiceCount || 0) > 0 ? (
                          <div className="mt-1 text-xs text-red-600 font-medium">
                            {customer.overdueInvoiceCount} overdue
                            {(customer.maxOverdueDays || 0) > 0 ? ` · max ${customer.maxOverdueDays}d` : ""}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                        {formatCurrency(customer.openingBalance)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openEditModal(customer)}>
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => handleDeleteCustomer(customer)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </Button>
                          <Link href={`/dashboard/customers/${customer.id}`}>
                            <Button variant="outline" size="sm" className="gap-1.5">
                              Profile
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog
        open={openCreateDialog}
        onOpenChange={(nextOpen) => {
          setOpenCreateDialog(nextOpen);
          if (!nextOpen) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-130" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editingCustomerId ? "Edit Customer" : "Add Customer"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateCustomer} className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Customer name"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Phone"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="City"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">State</label>
              <input
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="State"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Opening Balance</label>
              <input
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">CIBIL Score</label>
              <input
                type="number"
                min={300}
                max={900}
                value={cibilScore}
                onChange={(e) => setCibilScore(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="650"
              />
            </div>

            <DialogFooter className="sm:col-span-2 pt-3">
              <Button type="button" variant="ghost" onClick={() => setOpenCreateDialog(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" className="bg-gray-900 hover:bg-gray-800 text-white" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {editingCustomerId ? "Update Customer" : "Save Customer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

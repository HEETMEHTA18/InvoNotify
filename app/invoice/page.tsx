"use client";
import { useEffect, useState, useRef } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoreHorizontal, Pencil, Download, Mail, Trash2, Upload, Eye } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Invoice = {
  id: number;
  customer: string; // Legacy
  clientName: string; // New field
  amount: string; // Legacy
  total: string; // New field
  status: string;
  date: string;
  invoiceNumber: string;
};

export default function InvoicePage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [form, setForm] = useState({ customer: "", amount: "", status: "Paid", date: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const customerFileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    fetchInvoices();
  }, []);

  async function fetchInvoices() {
    const res = await fetch("/api/invoices");
    const data = await res.json();
    setInvoices(data);
  }

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to create invoice");
      } else {
        setForm({ customer: "", amount: "", status: "Paid", date: "" });
        fetchInvoices();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleBulkImport(e: React.ChangeEvent<HTMLInputElement>, type: 'invoice' | 'customer') {
    const file = e.target.files?.[0];
    if (!file) return;

    const endpoint = type === 'customer' ? "/api/customers/bulk-import" : "/api/invoices/bulk-import";

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      setLoading(true);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          body: content, // Send raw content (YAML/JSON)
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
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (customerFileInputRef.current) customerFileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="flex justify-center items-start w-full min-h-screen bg-[#FBFCFC] p-4">
      <div className="w-full max-w-6xl mt-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-[#596778]">Invoices</h1>
            <p className="text-[#8691A6]">Manage your invoices and payments</p>
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
              accept=".yml,.yaml,.json"
              className="hidden"
              ref={customerFileInputRef}
              onChange={(e) => handleBulkImport(e, 'customer')}
            />
            <Button
              variant="outline"
              onClick={() => customerFileInputRef.current?.click()}
              disabled={loading}
              className="bg-white mr-2 text-[#596778]"
            >
              <Upload className="w-4 h-4 mr-2" />
              Import Customers
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="bg-white text-[#596778]"
            >
              <Upload className="w-4 h-4 mr-2" />
              Import Invoices
            </Button>
          </div>
        </div>

        <Card className="rounded-xl border shadow-sm bg-white overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b pb-4 px-6 pt-6">
            <div>
              <CardTitle className="text-xl font-bold text-[#596778]">All Invoices</CardTitle>
            </div>
            {/* Quick Create Form - simplified or kept as is */}
            <form className="flex gap-2 items-end" onSubmit={handleCreateInvoice}>
              <div className="grid grid-cols-4 gap-2">
                <Input
                  value={form.customer}
                  onChange={e => setForm(f => ({ ...f, customer: e.target.value }))}
                  placeholder="Customer"
                  required
                  className="h-9"
                />
                <Input
                  type="number"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="Amount"
                  required
                  className="h-9"
                />
                <Input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  required
                  className="h-9"
                />
                <Button type="submit" className="bg-[#596778] hover:bg-[#4a5666] h-9" disabled={loading}>
                  {loading ? "..." : "Add"}
                </Button>
              </div>
            </form>
          </CardHeader>
          <CardContent className="p-0">
            {error && <div className="text-red-500 px-6 py-4 bg-red-50 border-b">{error}</div>}
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-[#F9FAFB] border-b">
                  <tr className="text-gray-500 text-xs uppercase tracking-wider">
                    <th className="px-6 py-3 text-left font-medium">Invoice No</th>
                    <th className="px-6 py-3 text-left font-medium">Customer</th>
                    <th className="px-6 py-3 text-left font-medium">Date</th>
                    <th className="px-6 py-3 text-right font-medium">Amount</th>
                    <th className="px-6 py-3 text-left font-medium">Status</th>
                    <th className="px-6 py-3 text-center font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EDEFF2]">
                  {invoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-[#596778]">
                        <Link href={`/invoice/${inv.id}`} className="hover:underline">
                          {inv.invoiceNumber || `#${inv.id}`}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{inv.clientName || inv.customer}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{new Date(inv.date).toLocaleDateString()}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-[#596778] text-right">
                        ${parseFloat(inv.total || inv.amount).toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${inv.status === "Paid" ? "bg-green-100 text-green-800" :
                          inv.status === "Pending" ? "bg-yellow-100 text-yellow-800" :
                            "bg-gray-100 text-gray-800"
                          }`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4 text-gray-400" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(`/invoice/${inv.id}`)}>
                              <Eye className="w-4 h-4 mr-2" /> View
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/invoice/${inv.id}?edit=true`)}>
                              <Pencil className="w-4 h-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/invoice/${inv.id}?download=true`)}>
                              <Download className="w-4 h-4 mr-2" /> Download
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600 focus:text-red-700" onClick={async () => {
                              if (confirm('Are you sure you want to delete this invoice?')) {
                                await fetch(`/api/invoices/${inv.id}`, { method: "DELETE" });
                                fetchInvoices();
                              }
                            }}>
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                  {invoices.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-gray-400 py-12">
                        No invoices found. Create one or import bulk data.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

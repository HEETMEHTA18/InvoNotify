
import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoreHorizontal, Pencil, Download, Mail, Trash2 } from "lucide-react";

type Invoice = {
  id: number;
  customer: string;
  amount: string;
  status: string;
  date: string;
};

export default function InvoicePage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [form, setForm] = useState({ customer: "", amount: "", status: "Paid", date: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <div className="flex justify-center items-start w-full">
      <div className="w-full max-w-4xl mt-8">
        <Card className="rounded-2xl border shadow p-0">
          <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
            <div>
              <CardTitle className="text-2xl font-bold">Invoices</CardTitle>
              <CardDescription>View and manage your invoices below.</CardDescription>
            </div>
            <CardAction>
              <form className="flex gap-2 items-end" onSubmit={handleCreateInvoice}>
                <div>
                  <Label htmlFor="customer">Customer</Label>
                  <Input
                    id="customer"
                    value={form.customer}
                    onChange={e => setForm(f => ({ ...f, customer: e.target.value }))}
                    placeholder="Customer name"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="Amount"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <select
                    id="status"
                    className="border rounded-md px-2 py-2 h-9"
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  >
                    <option value="Paid">Paid</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
                <Button type="submit" className="bg-black text-white hover:bg-gray-900 font-medium px-4 py-2 rounded-md" size="sm" disabled={loading}>
                  {loading ? "Creating..." : "+ Create Invoice"}
                </Button>
              </form>
            </CardAction>
          </CardHeader>
          <CardContent className="p-0">
            {error && <div className="text-red-600 px-6 pt-4">{error}</div>}
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="text-gray-500 text-sm">
                    <th className="px-6 py-4 text-left font-normal">Invoice ID</th>
                    <th className="px-6 py-4 text-left font-normal">Customer</th>
                    <th className="px-6 py-4 text-left font-normal">Amount</th>
                    <th className="px-6 py-4 text-left font-normal">Status</th>
                    <th className="px-6 py-4 text-left font-normal">Date</th>
                    <th className="px-6 py-4 text-left font-normal">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id} className="bg-white hover:bg-gray-50 transition">
                      <td className="px-6 py-4 font-medium">#{inv.id}</td>
                      <td className="px-6 py-4">{inv.customer}</td>
                      <td className="px-6 py-4">${parseFloat(inv.amount).toFixed(2)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-3 py-1 text-xs rounded ${inv.status === "Paid" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>{inv.status}</span>
                      </td>
                      <td className="px-6 py-4">{new Date(inv.date).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-5 h-5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>View</DropdownMenuItem>
                            <DropdownMenuItem>Edit</DropdownMenuItem>
                            <DropdownMenuItem>
                              <Pencil className="w-4 h-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Download className="w-4 h-4 mr-2" /> Download Invoice
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Mail className="w-4 h-4 mr-2" /> Reminder Email
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={async () => {
                              await fetch(`/api/invoices/${inv.id}`, { method: "DELETE" });
                              fetchInvoices();
                            }} className="text-red-600 focus:text-red-700">
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                  {invoices.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-gray-400 py-8">No invoices found.</td>
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

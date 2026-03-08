
"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Save, Download, Printer, Edit, Trash2, Plus } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

// Types
type InvoiceItem = {
    id?: number;
    description: string;
    quantity: number;
    rate: number;
    amount: number;
};

type Invoice = {
    id: number;
    invoiceNumber: string;
    clientName: string;
    clientEmail?: string;
    clientAddress?: string;
    senderName?: string;
    senderEmail?: string;
    senderAddress?: string;
    date: string;
    dueDate?: string;
    status: string;
    note?: string;
    subtotal: number;
    tax: number;
    total: number;
    currency: string;
    items: InvoiceItem[];
    // Legacy support
    customer?: string;
    amount?: number;
};

import { Suspense } from "react";

function InvoiceDetailContent() {
    const { id } = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [invoice, setInvoice] = useState<Invoice | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const invoiceRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (id) fetchInvoice();
    }, [id]);

    useEffect(() => {
        if (searchParams.get("edit") === "true") setIsEditing(true);
        if (searchParams.get("download") === "true" && invoice) handleDownload();
    }, [searchParams, invoice]);

    async function fetchInvoice() {
        try {
            const res = await fetch(`/api/invoices/${id}`);
            if (!res.ok) throw new Error("Failed to fetch");
            const data = await res.json();
            setInvoice(data);
        } catch (error) {
            console.error(error);
            alert("Error loading invoice");
        } finally {
            setLoading(false);
        }
    }

    async function handleSave() {
        if (!invoice) return;
        setSaving(true);
        try {
            // Recalculate totals before saving
            const items = invoice.items.map(item => ({
                ...item,
                amount: item.quantity * item.rate
            }));
            const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
            const total = subtotal; // Add tax logic if needed

            const updatedInvoice = { ...invoice, items, subtotal, total };

            const res = await fetch(`/api/invoices/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedInvoice),
            });

            if (!res.ok) throw new Error("Failed to update");

            const data = await res.json();
            setInvoice(data);
            setIsEditing(false);
        } catch (error) {
            console.error(error);
            alert("Error saving invoice");
        } finally {
            setSaving(false);
        }
    }

    async function handleDownload() {
        if (!invoiceRef.current) return;
        try {
            const canvas = await html2canvas(invoiceRef.current, { scale: 2 });
            const imgData = canvas.toDataURL("image/png");
            const pdf = new jsPDF("p", "mm", "a4");
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Invoice-${invoice?.invoiceNumber || "draft"}.pdf`);
        } catch (err) {
            console.error("PDF generation failed", err);
            alert("Failed to download PDF");
        }
    }

    function updateItem(index: number, field: keyof InvoiceItem, value: any) {
        if (!invoice) return;
        const newItems = [...invoice.items];
        newItems[index] = { ...newItems[index], [field]: value };
        // Auto-calc amount
        if (field === "quantity" || field === "rate") {
            newItems[index].amount = Number(newItems[index].quantity) * Number(newItems[index].rate);
        }
        setInvoice({ ...invoice, items: newItems });
    }

    function addItem() {
        if (!invoice) return;
        setInvoice({
            ...invoice,
            items: [...invoice.items, { description: "New Item", quantity: 1, rate: 0, amount: 0 }]
        });
    }

    function removeItem(index: number) {
        if (!invoice) return;
        setInvoice({
            ...invoice,
            items: invoice.items.filter((_, i) => i !== index)
        });
    }

    if (loading) return <div className="p-8 text-center">Loading invoice...</div>;
    if (!invoice) return <div className="p-8 text-center text-red-500">Invoice not found</div>;

    return (
        <div className="min-h-screen bg-[#FBFCFC] p-6 flex flex-col items-center">
            {/* Toolbar */}
            <div className="w-full max-w-4xl flex justify-between items-center mb-6 no-print">
                <Button variant="ghost" onClick={() => router.push("/invoice")}>
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <div className="flex gap-2">
                    {isEditing ? (
                        <>
                            <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                            <Button onClick={handleSave} disabled={saving} className="bg-[#596778] text-white">
                                <Save className="w-4 h-4 mr-2" /> {saving ? "Saving..." : "Save Changes"}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="outline" onClick={() => setIsEditing(true)}>
                                <Edit className="w-4 h-4 mr-2" /> Edit
                            </Button>
                            <Button variant="outline" onClick={() => window.print()}>
                                <Printer className="w-4 h-4 mr-2" /> Print
                            </Button>
                            <Button onClick={handleDownload} className="bg-[#596778] text-white">
                                <Download className="w-4 h-4 mr-2" /> Download PDF
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Invoice Document / Form */}
            <Card className="w-full max-w-4xl bg-white shadow-lg rounded-none sm:rounded-lg overflow-hidden border border-gray-200" id="invoice-container">
                <div className="p-10 min-h-275" ref={invoiceRef}>
                    {/* Header */}
                    <div className="flex justify-between items-start mb-12">
                        <div>
                            <h1 className="text-4xl font-bold text-[#596778] tracking-tight mb-2">INVOICE</h1>
                            <p className="text-[#8691A6] text-sm">#{invoice.invoiceNumber}</p>
                            <div className="mt-4">
                                {isEditing ? (
                                    <div className="grid gap-2">
                                        <Label>Your Details (Sender)</Label>
                                        <Input
                                            placeholder="Sender Name"
                                            value={invoice.senderName || ""}
                                            onChange={e => setInvoice({ ...invoice, senderName: e.target.value })}
                                        />
                                        <Input
                                            placeholder="Sender Email"
                                            value={invoice.senderEmail || ""}
                                            onChange={e => setInvoice({ ...invoice, senderEmail: e.target.value })}
                                        />
                                    </div>
                                ) : (
                                    <div className="text-sm text-gray-600">
                                        <p className="font-semibold text-gray-800">{invoice.senderName || "Your Company Name"}</p>
                                        <p>{invoice.senderEmail || "email@company.com"}</p>
                                        {invoice.senderAddress && <p>{invoice.senderAddress}</p>}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="text-right">
                            {/* Logo Placeholder */}
                            <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center mb-4 ml-auto">
                                <span className="text-xs text-gray-400">Logo</span>
                            </div>
                            <div className="grid gap-1">
                                {isEditing ? (
                                    <div className="grid gap-2 justify-end">
                                        <div className="flex items-center gap-2">
                                            <Label className="w-20">Date</Label>
                                            <Input
                                                type="date"
                                                value={invoice.date ? new Date(invoice.date).toISOString().split('T')[0] : ""}
                                                onChange={e => setInvoice({ ...invoice, date: e.target.value })}
                                                className="w-40"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Label className="w-20">Due Date</Label>
                                            <Input
                                                type="date"
                                                value={invoice.dueDate ? new Date(invoice.dueDate).toISOString().split('T')[0] : ""}
                                                onChange={e => setInvoice({ ...invoice, dueDate: e.target.value })}
                                                className="w-40"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <p className="text-sm text-gray-600">Date: <span className="font-medium text-gray-800">{new Date(invoice.date).toLocaleDateString()}</span></p>
                                        {invoice.dueDate && <p className="text-sm text-gray-600">Due Date: <span className="font-medium text-gray-800">{new Date(invoice.dueDate).toLocaleDateString()}</span></p>}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Client Info */}
                    <div className="mb-12 border-b pb-8">
                        <h3 className="text-xs font-semibold text-[#8691A6] uppercase tracking-wide mb-4">Bill To</h3>
                        {isEditing ? (
                            <div className="grid gap-2 max-w-xs">
                                <Input
                                    placeholder="Client Name"
                                    value={invoice.clientName || ""}
                                    onChange={e => setInvoice({ ...invoice, clientName: e.target.value })}
                                />
                                <Input
                                    placeholder="Client Email"
                                    value={invoice.clientEmail || ""}
                                    onChange={e => setInvoice({ ...invoice, clientEmail: e.target.value })}
                                />
                                <Input
                                    placeholder="Client Address"
                                    value={invoice.clientAddress || ""}
                                    onChange={e => setInvoice({ ...invoice, clientAddress: e.target.value })}
                                />
                            </div>
                        ) : (
                            <div className="text-gray-800">
                                <p className="text-xl font-bold mb-1">{invoice.clientName || invoice.customer || "Client Name"}</p>
                                <p className="text-sm text-gray-600">{invoice.clientEmail || ""}</p>
                                <p className="text-sm text-gray-600 whitespace-pre-line">{invoice.clientAddress || ""}</p>
                            </div>
                        )}
                    </div>

                    {/* Items Table */}
                    <div className="mb-10">
                        <table className="w-full">
                            <thead className="border-b-2 border-gray-100">
                                <tr>
                                    <th className="text-left py-3 text-xs font-semibold text-[#8691A6] uppercase">Description</th>
                                    <th className="text-center py-3 text-xs font-semibold text-[#8691A6] uppercase w-24">Qty</th>
                                    <th className="text-right py-3 text-xs font-semibold text-[#8691A6] uppercase w-32">Rate</th>
                                    <th className="text-right py-3 text-xs font-semibold text-[#8691A6] uppercase w-32">Amount</th>
                                    {isEditing && <th className="w-10"></th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {invoice.items.map((item, index) => (
                                    <tr key={index}>
                                        <td className="py-4">
                                            {isEditing ? (
                                                <Input
                                                    value={item.description}
                                                    onChange={e => updateItem(index, "description", e.target.value)}
                                                    className="h-8"
                                                />
                                            ) : (
                                                <p className="font-medium text-gray-800">{item.description}</p>
                                            )}
                                        </td>
                                        <td className="py-4 text-center">
                                            {isEditing ? (
                                                <Input
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={e => updateItem(index, "quantity", Number(e.target.value))}
                                                    className="h-8 text-center"
                                                />
                                            ) : (
                                                <p className="text-gray-600">{item.quantity}</p>
                                            )}
                                        </td>
                                        <td className="py-4 text-right">
                                            {isEditing ? (
                                                <Input
                                                    type="number"
                                                    value={item.rate}
                                                    onChange={e => updateItem(index, "rate", Number(e.target.value))}
                                                    className="h-8 text-right"
                                                />
                                            ) : (
                                                <p className="text-gray-600">${Number(item.rate).toFixed(2)}</p>
                                            )}
                                        </td>
                                        <td className="py-4 text-right">
                                            <p className="font-semibold text-gray-800">${Number(item.amount).toFixed(2)}</p>
                                        </td>
                                        {isEditing && (
                                            <td className="text-center">
                                                <Button variant="ghost" size="icon" onClick={() => removeItem(index)} className="h-8 w-8 text-red-400 hover:text-red-600">
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {isEditing && (
                            <Button variant="outline" size="sm" onClick={addItem} className="mt-4 border-dashed border-gray-300">
                                <Plus className="w-4 h-4 mr-2" /> Add Item
                            </Button>
                        )}
                    </div>

                    {/* Totals */}
                    <div className="flex justify-end mb-12">
                        <div className="w-64">
                            <div className="flex justify-between py-2 text-sm text-gray-600">
                                <span>Subtotal</span>
                                <span>${Number(invoice.subtotal || invoice.items.reduce((s, i) => s + Number(i.amount), 0)).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between py-2 text-sm text-gray-600">
                                <span>Tax</span>
                                <span>${Number(invoice.tax || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between py-4 border-t border-gray-200 mt-2">
                                <span className="font-bold text-gray-800">Total</span>
                                <span className="font-bold text-[#596778] text-lg">${Number(invoice.total || invoice.items.reduce((s, i) => s + Number(i.amount), 0)).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Footer / Notes */}
                    <div className="border-t pt-8">
                        <h4 className="text-xs font-semibold text-[#8691A6] uppercase tracking-wide mb-2">Notes</h4>
                        {isEditing ? (
                            <Input
                                value={invoice.note || ""}
                                onChange={e => setInvoice({ ...invoice, note: e.target.value })}
                                placeholder="Add a note (e.g. Payment terms)"
                            />
                        ) : (
                            <p className="text-sm text-gray-500">{invoice.note || "No additional notes."}</p>
                        )}
                    </div>
                </div>
                {/* Print/Download helper to hide URL etc in print mode */}
                <style jsx global>{`
            @media print {
                .no-print { display: none !important; }
                body { background: white; }
                #invoice-container { box-shadow: none; border: none; }
            }
         `}</style>
            </Card>
        </div>
    );
}

export default function InvoiceDetailPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
            <InvoiceDetailContent />
        </Suspense>
    );
}

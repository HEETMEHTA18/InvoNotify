"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type PaymentDialogInvoice = {
    id: string | number;
    invoiceNumber?: string | null;
    currency?: string | null;
    balance?: number | string | null;
    total?: number | string | null;
    [key: string]: unknown; // Allow extra properties from full Invoice
};

interface PaymentDialogProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: PaymentDialogInvoice | null;
    onSuccess: () => void;
}

export function PaymentDialog({ isOpen, onClose, invoice, onSuccess }: PaymentDialogProps) {
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState("Bank Transfer");
    const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
    const [note, setNote] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Keep amount in sync whenever a different invoice is selected.
    useEffect(() => {
        if (invoice) {
            setAmount(invoice.balance?.toString() || invoice.total?.toString() || "");
        }
    }, [invoice]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!invoice || !amount || parseFloat(amount) <= 0) return;

        setIsLoading(true);
        try {
            const res = await fetch("/api/payments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    invoiceId: invoice.id,
                    amount: parseFloat(amount),
                    method,
                    date,
                    note,
                }),
            });

            if (res.ok) {
                toast.success("Payment recorded successfully");
                onSuccess();
                onClose();
            } else {
                const data = await res.json();
                toast.error(data.error || "Failed to record payment");
            }
        } catch (error) {
            console.error(error);
            toast.error("An error occurred while recording payment");
        } finally {
            setIsLoading(false);
        }
    }

    if (!invoice) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]" aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>Record Payment for {invoice.invoiceNumber || `#${invoice.id}`}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="amount">Amount Paid ({invoice.currency || "INR"})</Label>
                        <Input
                            id="amount"
                            type="number"
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="Enter amount"
                            required
                        />
                        <p className="text-xs text-gray-500">
                            Balance Due: {invoice.currency || "INR"} {invoice.balance || invoice.total}
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="method">Payment Method</Label>
                        <select
                            id="method"
                            value={method}
                            onChange={(e) => setMethod(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white"
                        >
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="UPI">UPI</option>
                            <option value="Cash">Cash</option>
                            <option value="Cheque">Cheque</option>
                            <option value="Credit Card">Credit Card</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="date">Payment Date</Label>
                        <Input
                            id="date"
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="note">Notes (Optional)</Label>
                        <Input
                            id="note"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="e.g. Received via NEFT"
                        />
                    </div>
                    <DialogFooter className="pt-4">
                        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Record Payment
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

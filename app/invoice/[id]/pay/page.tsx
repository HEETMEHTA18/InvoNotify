"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, ShieldCheck, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";

type PublicInvoice = {
  invoiceNumber: string;
  customerName: string | null;
  merchantName: string;
  total: number;
  amountPaid: number;
  amountDue: number;
  currency: string;
  status: string;
  dueDate: string | null;
  issuedAt: string;
  isPaid: boolean;
  hasActivePaymentLink: boolean;
  items: Array<{
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }>;
};

export default function InvoicePayPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const paymentState = searchParams.get("payment");

  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/invoices/${id}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Invoice not found");
        }
        if (!cancelled) setInvoice(await res.json());
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load invoice");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handlePayNow = async () => {
    setPaying(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/invoices/${id}/pay`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.paymentUrl) {
        throw new Error(body.error || "Could not start payment");
      }
      window.location.href = body.paymentUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment could not be started");
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-dvh flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading invoice…
        </div>
      </main>
    );
  }

  if (error && !invoice) {
    return (
      <main className="min-h-dvh flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-md text-center">
          <ReceiptText className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-gray-900">Invoice unavailable</h1>
          <p className="text-sm text-gray-500 mt-1">{error}</p>
        </div>
      </main>
    );
  }

  if (!invoice) return null;

  const currencySymbol = invoice.currency === "INR" ? "₹" : `${invoice.currency} `;
  const formatMoney = (n: number) =>
    `${currencySymbol}${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  const overdue =
    invoice.dueDate && new Date(invoice.dueDate) < new Date() && !invoice.isPaid;

  return (
    <main className="min-h-dvh bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto">
        {/* Payment result banners */}
        {paymentState === "success" && !invoice.isPaid && (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 px-4 py-3 text-sm">
            Payment initiated. This page updates once your payment is confirmed.
          </div>
        )}
        {paymentState === "cancel" && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm">
            Payment was cancelled. You can retry below.
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-6 py-6 border-b border-gray-100 bg-gradient-to-b from-white to-gray-50/50">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {invoice.merchantName}
            </p>
            <h1 className="text-xl font-bold text-gray-900 mt-0.5">
              Invoice {invoice.invoiceNumber}
            </h1>
            {invoice.customerName && (
              <p className="text-sm text-gray-500 mt-0.5">Billed to {invoice.customerName}</p>
            )}
          </div>

          {/* Amount */}
          <div className="px-6 py-6 text-center border-b border-gray-100">
            {invoice.isPaid ? (
              <>
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-green-600">Paid in full</p>
                <p className="text-sm text-gray-500 mt-1">
                  Thank you{invoice.customerName ? `, ${invoice.customerName}` : ""}!
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Amount Due
                </p>
                <p className={`text-4xl font-bold mt-1 ${overdue ? "text-red-600" : "text-gray-900"}`}>
                  {formatMoney(invoice.amountDue)}
                </p>
                {invoice.dueDate && (
                  <p className={`text-sm mt-1 ${overdue ? "text-red-500 font-medium" : "text-gray-500"}`}>
                    {overdue ? "Overdue since " : "Due "}
                    {new Date(invoice.dueDate).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                )}
                {invoice.amountPaid > 0 && (
                  <p className="text-xs text-gray-400 mt-2">
                    {formatMoney(invoice.amountPaid)} already paid of{" "}
                    {formatMoney(invoice.total)}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Line items */}
          {invoice.items.length > 0 && (
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                Items
              </p>
              <ul className="divide-y divide-gray-50">
                {invoice.items.map((item, idx) => (
                  <li key={idx} className="py-2 flex justify-between text-sm">
                    <span className="text-gray-700">
                      {item.description}
                      {item.quantity > 1 && (
                        <span className="text-gray-400"> × {item.quantity}</span>
                      )}
                    </span>
                    <span className="font-medium text-gray-900">{formatMoney(item.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Pay action */}
          {!invoice.isPaid && (
            <div className="px-6 py-6">
              <Button
                onClick={handlePayNow}
                disabled={paying}
                size="lg"
                className="w-full h-12 text-base font-semibold"
              >
                {paying ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Starting secure checkout…
                  </>
                ) : (
                  <>Pay {formatMoney(invoice.amountDue)} Now</>
                )}
              </Button>

              {error && (
                <p className="text-sm text-red-600 mt-3 text-center">{error}</p>
              )}

              <div className="flex items-center justify-center gap-1.5 mt-4 text-xs text-gray-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                Secured by Razorpay · UPI, cards, netbanking & wallets
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Powered by InvoNotify AI
        </p>
      </div>
    </main>
  );
}
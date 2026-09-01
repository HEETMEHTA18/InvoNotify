import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { CHASEABLE_INVOICE_STATUSES } from "@/lib/customer-credit";
import type { RawFeatures, RiskScore } from "./ml/types";
import { scoreRisk } from "./ml/risk-model";
import { extractCustomerFeatures } from "./ml/features";

type InvoiceWithRelations = Prisma.InvoiceGetPayload<{
  include: {
    customerRel: true;
    payments: true;
    reminderLogs: true;
  };
}>;

export type RecoveryContext = {
  invoice: {
    id: number;
    invoiceNumber: string;
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    total: number;
    amountPaid: number;
    balance: number;
    currency: string;
    status: string;
    dueDate: Date | null;
    daysOverdue: number;
    customerId: number | null;
    razorpayPaymentLinkId: string | null;
    razorpayPaymentLinkUrl: string | null;
  };
  customer: {
    id: number | null;
    name: string;
    email: string;
    isVipExempt: boolean;
    communicationOptOut: boolean;
    cibilScore: number;
    previousInvoiceCount: number;
    previousLatePayments: number;
    averagePaymentDelayDays: number;
    paymentSuccessRate: number;
    customerAgeDays: number;
    historyCount: number;
  };
  risk: RiskScore;
  features: RawFeatures;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY_MS));
}

function getAmount(value: Prisma.Decimal | number | string | null | undefined) {
  return Number(value ?? 0);
}

/**
 * Loads an invoice plus its customer history and produces the feature vector
 * and risk score used by every downstream AI layer.
 */
export async function buildRecoveryContext(invoiceId: number): Promise<RecoveryContext> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customerRel: true,
      payments: true,
      reminderLogs: true,
    },
  });

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  const history = await loadCustomerHistory(invoice);

  const balance = Math.max(
    0,
    getAmount(invoice.balance) || getAmount(invoice.total) - getAmount(invoice.amountPaid),
  );
  const now = new Date();
  const daysOverdue = invoice.dueDate && invoice.dueDate < now
    ? daysBetween(invoice.dueDate, now)
    : 0;

  const customerFeatures = extractCustomerFeatures(history);
  const features: RawFeatures = {
    amountDue: balance,
    daysOverdue,
    previousReminders: invoice.reminderLogs?.length ?? 0,
    isVipExempt: invoice.customerRel?.isVipExempt ?? false,
    cibilScore: invoice.customerRel?.cibilScore ?? 650,
    humanEngaged: false,
    ...customerFeatures,
  };

  const risk = scoreRisk(features);

  return {
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName || invoice.customer,
      clientEmail: invoice.clientEmail,
      clientPhone: invoice.clientPhone,
      total: getAmount(invoice.total),
      amountPaid: getAmount(invoice.amountPaid),
      balance,
      currency: invoice.currency || "INR",
      status: invoice.status,
      dueDate: invoice.dueDate,
      daysOverdue,
      customerId: invoice.customerId,
      razorpayPaymentLinkId: invoice.razorpayPaymentLinkId,
      razorpayPaymentLinkUrl: invoice.razorpayPaymentLinkUrl,
    },
    customer: {
      id: invoice.customerId,
      name: invoice.clientName || invoice.customer || "Unknown",
      email: invoice.clientEmail,
      isVipExempt: invoice.customerRel?.isVipExempt ?? false,
      communicationOptOut: invoice.customerRel?.communicationOptOut ?? false,
      cibilScore: invoice.customerRel?.cibilScore ?? 650,
      ...history,
    },
    risk,
    features,
  };
}

/**
 * Derives customer behavior statistics from the customer's historical
 * invoices (excluding the current one).
 */
async function loadCustomerHistory(invoice: InvoiceWithRelations) {
  const now = new Date();
  const scope = invoice.ownerUserId
    ? { OR: [{ ownerUserId: invoice.ownerUserId }, { userId: invoice.ownerUserId }] }
    : {};

  const base = {
    id: { not: invoice.id },
    // "Overdue" belongs here as much as "Pending" does: leaving it out drops a
    // customer's currently-overdue invoices from their own payment history,
    // which makes a chronic defaulter look like a clean payer to the risk model.
    status: { in: ["Paid", ...CHASEABLE_INVOICE_STATUSES] },
    ...scope,
  };

  const where: Prisma.InvoiceWhereInput = invoice.customerId
    ? { ...base, customerId: invoice.customerId }
    : {
        ...base,
        OR: [
          { clientEmail: invoice.clientEmail || "__none__" },
          ...(invoice.clientName
            ? [{ clientName: invoice.clientName }]
            : []),
        ],
      };

  const historyInvoices = await prisma.invoice.findMany({
    where,
    select: {
      id: true,
      dueDate: true,
      date: true,
      status: true,
      payments: {
        select: { date: true, amount: true },
        orderBy: { date: "asc" },
      },
    },
  });

  let paidCount = 0;
  let lateCount = 0;
  let totalDelayDays = 0;
  let delaySamples = 0;
  let earliestInvoiceDate: Date | null = null;

  for (const item of historyInvoices) {
    const paid = item.status === "Paid" || (item.payments?.length ?? 0) > 0;
    if (paid) paidCount += 1;

    const due = item.dueDate;
    if (paid && due) {
      const lastPayment = item.payments?.[item.payments.length - 1];
      const paidAt = lastPayment?.date ?? item.date;
      const delay = Math.max(0, Math.round((paidAt.getTime() - due.getTime()) / DAY_MS));
      if (delay > 0) lateCount += 1;
      totalDelayDays += delay;
      delaySamples += 1;
    }

    if (!earliestInvoiceDate || item.date < earliestInvoiceDate) {
      earliestInvoiceDate = item.date;
    }
  }

  const previousInvoiceCount = historyInvoices.length;
  return {
    previousInvoiceCount,
    previousLatePayments: lateCount,
    averagePaymentDelayDays: delaySamples > 0 ? totalDelayDays / delaySamples : 0,
    paymentSuccessRate: previousInvoiceCount > 0 ? paidCount / previousInvoiceCount : 0,
    customerAgeDays: earliestInvoiceDate ? daysBetween(earliestInvoiceDate, now) : 0,
    historyCount: previousInvoiceCount,
  };
}
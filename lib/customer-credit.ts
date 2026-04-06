type CreditInvoice = {
  status: string | null;
  dueDate: Date | string | null;
  total: number;
  amountPaid: number;
  balance: number;
};

const MIN_CIBIL = 300;
const MAX_CIBIL = 900;
const BASE_CIBIL = 750;

function clampCibil(value: number) {
  if (!Number.isFinite(value)) return 650;
  return Math.max(MIN_CIBIL, Math.min(MAX_CIBIL, Math.round(value)));
}

function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function diffDays(later: Date, earlier: Date) {
  const msInDay = 24 * 60 * 60 * 1000;
  return Math.floor((later.getTime() - earlier.getTime()) / msInDay);
}

export function deriveInvoiceStatus(status: string | null, dueDate: Date | string | null, balance: number, now = new Date()) {
  const normalized = (status || "Pending").trim();
  if (normalized.toLowerCase() === "paid") return "Paid";

  const parsedDueDate = toDate(dueDate);
  if (parsedDueDate && Number(balance || 0) > 0) {
    const today = startOfToday(now);
    const due = startOfToday(parsedDueDate);
    if (due.getTime() < today.getTime()) {
      return "Overdue";
    }
  }

  return normalized || "Pending";
}

export function getOverdueDays(dueDate: Date | string | null, status: string | null, balance: number, now = new Date()) {
  const effectiveStatus = deriveInvoiceStatus(status, dueDate, balance, now);
  if (effectiveStatus !== "Overdue") return 0;

  const parsedDueDate = toDate(dueDate);
  if (!parsedDueDate) return 0;

  const today = startOfToday(now);
  const due = startOfToday(parsedDueDate);
  return Math.max(0, diffDays(today, due));
}

export function calculateCibilScoreFromInvoices(invoices: CreditInvoice[], now = new Date()) {
  let score = BASE_CIBIL;

  let paidInvoices = 0;
  let overdueInvoices = 0;
  let totalInvoiced = 0;
  let totalOutstanding = 0;

  for (const invoice of invoices) {
    const total = Number(invoice.total || 0);
    const amountPaid = Number(invoice.amountPaid || 0);
    const balance = Number(invoice.balance || 0);
    const status = deriveInvoiceStatus(invoice.status, invoice.dueDate, balance, now);

    totalInvoiced += total;
    totalOutstanding += Math.max(0, balance);

    if (status === "Paid" || (total > 0 && amountPaid >= total)) {
      paidInvoices += 1;
      continue;
    }

    if (status === "Overdue") {
      overdueInvoices += 1;
      const overdueDays = getOverdueDays(invoice.dueDate, invoice.status, balance, now);
      if (overdueDays > 120) score -= 90;
      else if (overdueDays > 90) score -= 70;
      else if (overdueDays > 60) score -= 50;
      else if (overdueDays > 30) score -= 35;
      else if (overdueDays > 7) score -= 20;
      else score -= 10;
    }
  }

  score -= overdueInvoices * 8;
  score += Math.min(60, paidInvoices * 4);

  if (totalInvoiced > 0) {
    const outstandingRatio = Math.min(1, totalOutstanding / totalInvoiced);
    score -= Math.round(outstandingRatio * 120);
  }

  return clampCibil(score);
}

export function normalizeCustomerKey(value: string | null | undefined) {
  return (value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

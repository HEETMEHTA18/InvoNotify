import type { RawFeatures, NormalizedFeatures } from "./types";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Normalizes raw domain features into a stable [0,1] scale.
 * Every raw feature must map to a normalized feature that the model
 * weights reference. Feature engineering lives here so the model
 * stays small and interpretable.
 */
export function normalizeFeatures(raw: RawFeatures): NormalizedFeatures {
  return {
    amountDue: clamp01(Math.log1p(Math.max(0, raw.amountDue)) / Math.log1p(100000)),
    daysOverdue: clamp01(Math.max(0, raw.daysOverdue) / 30),
    customerAgeDays: clamp01(Math.max(0, raw.customerAgeDays) / 365),
    previousInvoiceCount: clamp01(Math.max(0, raw.previousInvoiceCount) / 10),
    previousLatePayments: clamp01(Math.max(0, raw.previousLatePayments) / 5),
    averagePaymentDelayDays: clamp01(Math.max(0, raw.averagePaymentDelayDays) / 30),
    paymentSuccessRate: clamp01(raw.paymentSuccessRate),
    previousReminders: clamp01(Math.max(0, raw.previousReminders) / 5),
    isVipExempt: raw.isVipExempt ? 1 : 0,
    cibilScore: clamp01((Math.max(300, Math.min(900, raw.cibilScore)) - 300) / 600),
    humanEngaged: raw.humanEngaged ? 1 : 0,
  };
}

export function extractCustomerFeatures(args: {
  previousInvoiceCount: number;
  previousLatePayments: number;
  averagePaymentDelayDays: number;
  paymentSuccessRate: number;
  customerAgeDays: number;
}): Pick<
  RawFeatures,
  | "previousInvoiceCount"
  | "previousLatePayments"
  | "averagePaymentDelayDays"
  | "paymentSuccessRate"
  | "customerAgeDays"
> {
  const count = Math.max(0, args.previousInvoiceCount);

  return {
    previousInvoiceCount: count,
    previousLatePayments: Math.min(count, Math.max(0, args.previousLatePayments)),
    averagePaymentDelayDays: Math.max(0, args.averagePaymentDelayDays),
    paymentSuccessRate:
      count === 0
        ? 0
        : Math.max(0, Math.min(1, args.paymentSuccessRate)),
    customerAgeDays: Math.max(0, args.customerAgeDays),
  };
}
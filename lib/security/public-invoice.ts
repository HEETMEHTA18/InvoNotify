import { randomBytes } from "node:crypto";

/**
 * A customer-facing invoice URL is a bearer capability, not a numeric record
 * identifier. Numeric primary keys are enumerable and must never authorize a
 * public invoice read or payment-link creation.
 */
export const PUBLIC_INVOICE_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export function createPublicInvoiceToken(): string {
  return randomBytes(32).toString("hex");
}

export function parsePublicInvoiceToken(value: string | undefined): string | null {
  return value && PUBLIC_INVOICE_TOKEN_PATTERN.test(value) ? value : null;
}

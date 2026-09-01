/**
 * Write allowlists for every client-updatable model.
 *
 * The dominant defect this replaces is mass assignment (checklist E-B02,
 * attack tests T-007 and T-008): handlers were doing
 *
 *     const data = await req.json();
 *     await prisma.invoice.updateMany({ where: { id, ...scope }, data });
 *
 * The ownership scope in that query is correct, so it is not an IDOR — but the
 * caller still chooses which *columns* to write on a row they legitimately own.
 * On `Invoice` that is a money bug, not a cosmetic one:
 *
 *     PATCH /api/invoices/42 {"status":"Paid","balance":0,"amountPaid":999999}
 *       -> invoice marked settled without a payment ever arriving
 *     PATCH /api/invoices/42 {"razorpayPaymentLinkUrl":"https://attacker.example"}
 *       -> the real customer's "Pay now" button now points at the attacker
 *     PATCH /api/invoices/42 {"ownerUserId":"<someone-else>"}
 *       -> the row is handed to another tenant
 *
 * So the rule is: parse the body into a schema that lists the fields a client
 * may set, and let Zod drop everything else. Money and ownership columns are
 * absent from every schema below — they are derived server-side from line items
 * and from the session, never accepted from the wire.
 */
import { z } from "zod";

/** Trimmed, length-capped free text. Empty string stays empty (not undefined). */
const text = (max: number) => z.string().trim().max(max);

/** A money amount a client may legitimately state (rates, quantities). */
const money = z.coerce.number().finite().min(0).max(1_000_000_000);

/**
 * A boolean from a form, query string or JSON body.
 *
 * `z.coerce.boolean()` is `Boolean(value)`, which makes the string "false"
 * become `true` — the exact opposite of what a caller sending `"false"` means.
 * Parse the common textual spellings explicitly instead.
 */
const bool = z.union([
  z.boolean(),
  z
    .enum(["true", "false", "1", "0", "yes", "no", "on", "off"])
    .transform((v) => v === "true" || v === "1" || v === "yes" || v === "on"),
]);

const isoDate = z
  .union([z.string().trim().min(1), z.date()])
  .transform((v) => (v instanceof Date ? v : new Date(v)))
  .refine((d) => !Number.isNaN(d.getTime()), { message: "Invalid date" });

/**
 * Statuses a client may assign directly.
 *
 * "Paid" is deliberately excluded. An invoice becomes Paid because a payment was
 * recorded (a Razorpay/Stripe webhook, or POST /api/payments which writes a
 * Payment row and recomputes the balance), never because a request said so.
 */
export const CLIENT_SETTABLE_INVOICE_STATUSES = [
  "Draft",
  "Pending",
  "Overdue",
  "Disputed",
  "Cancelled",
] as const;

export const invoiceItemSchema = z.object({
  description: text(500).default(""),
  quantity: z.coerce.number().finite().min(0).max(1_000_000).default(1),
  rate: money.default(0),
  amount: money.default(0),
});

/**
 * Fields a merchant may set on their own invoice.
 *
 * Excluded on purpose — all of them were writable before:
 *   ownerUserId, userId            tenancy; taken from the session
 *   total, subtotal, balance,      money; recomputed from items server-side
 *     amountPaid, tax, cgst,
 *     sgst, igst, amount
 *   razorpayPaymentLinkId/Url,     provider state; only the provider integration
 *     razorpayPaymentId              writes these
 *   publicToken                    the public-pay capability itself
 *   id, createdAt, updatedAt       database-managed
 */
export const invoiceUpdateSchema = z
  .object({
    invoiceNumber: text(64),
    status: z.enum(CLIENT_SETTABLE_INVOICE_STATUSES),
    date: isoDate,
    dueDate: isoDate.nullable(),
    currency: text(8).regex(/^[A-Za-z]{3}$/, "Currency must be a 3-letter code"),
    note: text(2000),
    template: text(64),
    gstType: z.enum(["INTRA", "INTER", "NONE"]),
    taxRate: z.coerce.number().finite().min(0).max(100),
    discount: money,

    clientName: text(200),
    clientEmail: z.union([z.string().trim().email(), z.literal("")]),
    clientAddress: text(1000),
    clientPhone: text(32),
    customer: text(200),
    customerId: z.coerce.number().int().positive().nullable(),

    senderName: text(200),
    senderEmail: z.union([z.string().trim().email(), z.literal("")]),
    senderAddress: text(1000),

    autoReminderEnabled: z.coerce.boolean(),
    overdueReminderEnabled: z.coerce.boolean(),
    overdueReminderEveryDays: z.coerce.number().int().min(1).max(90),
    reminderOffsets: z.array(z.coerce.number().int().min(-365).max(365)).max(20),
    reminderChannel: z.enum(["EMAIL", "DASHBOARD", "NONE"]),

    items: z.array(invoiceItemSchema).max(200),
  })
  .partial()
  .strip();

export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>;

/** Same allowlist for creation, plus the fields that are mandatory up front. */
export const invoiceCreateSchema = invoiceUpdateSchema.extend({
  clientName: text(200).min(1, "Client name is required"),
  items: z.array(invoiceItemSchema).min(1, "At least one line item is required").max(200),
});

/**
 * Fields a merchant may set on their own customer.
 *
 * `cibilScore` is excluded: it is a derived credit signal the server recomputes
 * from invoice history, and it feeds the AI recovery risk model. A client that
 * could set it to 900 would steer its own collection strategy.
 */
export const customerUpdateSchema = z
  .object({
    name: text(200).min(1),
    group: text(120),
    openingBalance: z.coerce.number().finite().min(-1_000_000_000).max(1_000_000_000),
    address: text(1000),
    city: text(120),
    state: text(120),
    country: text(120),
    gstin: text(20),
    phone: text(32),
    email: z.union([z.string().trim().email(), z.literal("")]),
    isVipExempt: z.coerce.boolean(),
    communicationOptOut: z.coerce.boolean(),
  })
  .partial()
  .strip();

export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

export const customerCreateSchema = customerUpdateSchema.extend({
  name: text(200).min(1, "Customer name is required"),
});

/** Fields a merchant may set on their own product. */
export const productUpdateSchema = z
  .object({
    name: text(200).min(1),
    sku: text(64),
    unit: text(32),
    hsnCode: text(20),
    description: text(2000),
    basePrice: money,
    defaultTaxRate: z.coerce.number().finite().min(0).max(100),
    isActive: z.coerce.boolean(),
  })
  .partial()
  .strip();

export const productCreateSchema = productUpdateSchema.extend({
  name: text(200).min(1, "Product name is required"),
});

/**
 * Flattens a Zod failure into a client-safe shape.
 *
 * Field paths and messages are fine to return; the raw issue objects are not,
 * because they echo the received value back and can carry whatever the caller
 * sent (checklist E-B10 — no internal detail in error responses).
 */
export function formatZodError(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/**
 * Drops keys whose value is `undefined`.
 *
 * Prisma treats an explicit `undefined` as "leave alone", but an object built
 * from `.partial()` still carries the absent keys, and passing them through
 * makes the update statement noisier than it needs to be.
 */
export function definedOnly<T extends object>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<T>;
}

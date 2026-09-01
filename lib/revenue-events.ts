import { Prisma, prisma } from "@/lib/db";
import { toInputJson } from "@/lib/json";
import { z } from "zod";

/**
 * The merchant is deliberately absent from this schema. It is derived from the
 * authenticated session in the route, never accepted from a request body.
 */
export const revenueEventInputSchema = z
  .object({
    source: z.string().trim().min(1).max(100),
    sourceEventId: z.string().trim().min(1).max(255),
    eventType: z.string().trim().min(1).max(120),
    customerId: z.string().trim().min(1).max(255).optional(),
    amount: z.number().finite().positive(),
    currency: z.string().trim().length(3).default("INR"),
    /** Source event time. Defaults to receipt time only for backwards-compatible demo input. */
    occurredAt: z.coerce.date().optional(),
    failureCode: z.string().trim().min(1).max(120).optional(),
    failureReason: z.string().trim().min(1).max(2_000).optional(),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export type RevenueEventInput = z.infer<typeof revenueEventInputSchema>;

export class RevenueEventConflictError extends Error {
  constructor() {
    super("An event with this identifier already exists");
    this.name = "RevenueEventConflictError";
  }
}

/** A semantic input error that Zod cannot express without knowing the event kind. */
export class RevenueEventValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RevenueEventValidationError";
    this.code = code;
  }
}

class RevenueEventProcessingError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RevenueEventProcessingError";
    this.code = code;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export type IngestRevenueEventResult =
  | {
      status: "accepted";
      eventId: number;
      recoveryCaseId: number;
      caseDisposition: "created" | "attached";
    }
  | {
      status: "quarantined";
      eventId: number;
      code: string;
      message: string;
    }
  | { status: "duplicate"; eventId: number; recoveryCaseId: number | null };

type CanonicalRevenueEventType =
  | "PAYMENT_FAILED"
  | "CHECKOUT_ABANDONED"
  | "SUBSCRIPTION_FAILED"
  | "INVOICE_OVERDUE";

type NormalizedRevenueEvent = {
  eventType: CanonicalRevenueEventType | "UNKNOWN";
  customerId?: string;
  failureCode?: string;
  quarantine?: { code: string; message: string };
};

const EVENT_TYPE_ALIASES: Record<string, CanonicalRevenueEventType> = {
  PAYMENT_FAILED: "PAYMENT_FAILED",
  PAYMENT_FAILURE: "PAYMENT_FAILED",
  CHECKOUT_ABANDONED: "CHECKOUT_ABANDONED",
  CHECKOUT_ABANDON: "CHECKOUT_ABANDONED",
  SUBSCRIPTION_FAILED: "SUBSCRIPTION_FAILED",
  SUBSCRIPTION_FAILURE: "SUBSCRIPTION_FAILED",
  INVOICE_OVERDUE: "INVOICE_OVERDUE",
};

const FAILURE_CODE_ALIASES: Record<string, string> = {
  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
  ISSUER_UNAVAILABLE: "ISSUER_UNAVAILABLE",
  BANK_UNAVAILABLE: "ISSUER_UNAVAILABLE",
  NETWORK_TIMEOUT: "NETWORK_TIMEOUT",
  TIMEOUT: "NETWORK_TIMEOUT",
  AUTHENTICATION_FAILED: "AUTHENTICATION_FAILED",
  AUTH_FAILED: "AUTHENTICATION_FAILED",
  CARD_EXPIRED: "CARD_EXPIRED",
  CUSTOMER_ABANDONED: "CUSTOMER_ABANDONED",
  MANDATE_REVOKED: "MANDATE_REVOKED",
  INVOICE_OVERDUE: "INVOICE_OVERDUE",
};

function canonicalKey(value: string): string {
  return value.trim().toUpperCase().replace(/[.\-\s]+/g, "_");
}

function stringFromPayload(payload: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 255);
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
      return String(value);
    }
  }
  return undefined;
}

function eventCustomerId(input: RevenueEventInput): string | undefined {
  return (
    input.customerId ||
    stringFromPayload(input.payload, ["customerId", "customer_id", "externalCustomerId", "customerEmail"])
  );
}

function normalizeEvent(input: RevenueEventInput): NormalizedRevenueEvent {
  const eventType = EVENT_TYPE_ALIASES[canonicalKey(input.eventType)];
  if (!eventType) {
    return {
      eventType: "UNKNOWN",
      quarantine: {
        code: "UNKNOWN_EVENT_TYPE",
        message: "Event type is not a supported revenue-at-risk signal",
      },
    };
  }

  const customerId = eventCustomerId(input);
  if (!customerId) {
    throw new RevenueEventValidationError(
      "MISSING_CUSTOMER_REFERENCE",
      "A customer reference is required for a revenue-at-risk event",
    );
  }

  const defaultFailureCode =
    eventType === "CHECKOUT_ABANDONED"
      ? "CUSTOMER_ABANDONED"
      : eventType === "INVOICE_OVERDUE"
        ? "INVOICE_OVERDUE"
        : undefined;
  const failureCode = input.failureCode
    ? FAILURE_CODE_ALIASES[canonicalKey(input.failureCode)]
    : defaultFailureCode;

  if (input.failureCode && !failureCode) {
    return {
      eventType,
      customerId,
      quarantine: {
        code: "UNKNOWN_FAILURE_CODE",
        message: "Failure code is not in the canonical recovery taxonomy",
      },
    };
  }

  return { eventType, customerId, failureCode };
}

function invoiceIdFromPayload(payload: Record<string, unknown>): number | undefined {
  const value = payload.invoiceId ?? payload.invoice_id;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function profileFromPayload(input: RevenueEventInput, customerId: string) {
  const name =
    stringFromPayload(input.payload, ["customerName", "customer_name", "clientName", "name"]) ||
    `External customer ${customerId}`;
  const email = stringFromPayload(input.payload, ["customerEmail", "customer_email", "clientEmail", "email"]);
  return { name: name.slice(0, 160), email: email?.slice(0, 320) };
}

const RAW_EVENT_METADATA_KEY = "__invoNotifyRevenueEvent";

function storedRawPayload(input: RevenueEventInput) {
  return {
    ...input.payload,
    [RAW_EVENT_METADATA_KEY]: {
      originalEventType: input.eventType,
      occurredAt: input.occurredAt?.toISOString() || null,
    },
  };
}

function sourceOccurredAt(payload: Record<string, unknown>): Date | undefined {
  const metadata = payload[RAW_EVENT_METADATA_KEY];
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const candidate = (metadata as Record<string, unknown>).occurredAt;
  if (typeof candidate !== "string") return undefined;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

async function recordQuarantine(args: {
  eventId: number;
  code: string;
  message: string;
}): Promise<Extract<IngestRevenueEventResult, { status: "quarantined" }>> {
  const { eventId, code, message } = args;
  await prisma.$transaction([
    prisma.revenueEvent.update({
      where: { id: eventId },
      data: { status: "QUARANTINED", normalizedAt: new Date() },
    }),
    prisma.eventIngestionError.create({
      data: { revenueEventId: eventId, code, message, severity: "WARNING" },
    }),
  ]);
  return { status: "quarantined", eventId, code, message };
}

async function linkEventToRecoveryCase(args: {
  merchantId: string;
  eventId: number;
  input: RevenueEventInput;
  normalized: NormalizedRevenueEvent;
}): Promise<Extract<IngestRevenueEventResult, { status: "accepted" }>> {
  const { merchantId, eventId, input, normalized } = args;
  const customerId = normalized.customerId;
  if (!customerId || normalized.eventType === "UNKNOWN") {
    throw new RevenueEventProcessingError("INVALID_EVENT", "Event cannot create a recovery case");
  }

  return prisma.$transaction(async (tx) => {
    const linkedEvent = await tx.revenueEvent.findUnique({
      where: { id: eventId },
      select: { recoveryCaseId: true },
    });
    if (!linkedEvent) {
      throw new RevenueEventProcessingError("EVENT_NOT_FOUND", "Revenue event is no longer available");
    }
    if (linkedEvent.recoveryCaseId) {
      return {
        status: "accepted" as const,
        eventId,
        recoveryCaseId: linkedEvent.recoveryCaseId,
        caseDisposition: "attached" as const,
      };
    }

    const referencedInvoiceId = invoiceIdFromPayload(input.payload);
    let invoice;
    if (referencedInvoiceId) {
      invoice = await tx.invoice.findFirst({
        where: {
          id: referencedInvoiceId,
          OR: [{ ownerUserId: merchantId }, { userId: merchantId }],
        },
        select: { id: true },
      });
      if (!invoice) {
        throw new RevenueEventProcessingError(
          "INVALID_OBLIGATION_REFERENCE",
          "The referenced invoice is not available for this merchant",
        );
      }
    } else {
      const profile = profileFromPayload(input, customerId);
      const existingCustomer = await tx.customer.findFirst({
        where: {
          ownerUserId: merchantId,
          OR: [
            { name: profile.name },
            ...(profile.email ? [{ email: profile.email }] : []),
          ],
        },
        select: { id: true },
      });
      const customer =
        existingCustomer ||
        (await tx.customer.create({
          data: { name: profile.name, email: profile.email, ownerUserId: merchantId },
          select: { id: true },
        }));
      const occurredAt = input.occurredAt || new Date();
      invoice = await tx.invoice.create({
        data: {
          invoiceNumber: `RVP-${eventId}`,
          customer: customerId,
          customerId: customer.id,
          clientName: profile.name,
          clientEmail: profile.email || "",
          amount: input.amount,
          subtotal: input.amount,
          total: input.amount,
          balance: input.amount,
          currency: input.currency.toUpperCase(),
          status: "Overdue",
          date: occurredAt,
          dueDate: new Date(occurredAt.getTime() - 24 * 60 * 60 * 1000),
          note: `Revenue event ${normalized.eventType} (${input.source}:${input.sourceEventId})`,
          ownerUserId: merchantId,
        },
        select: { id: true },
      });
    }

    const existingCase = await tx.recoveryCase.findUnique({
      where: { invoiceId: invoice.id },
      select: { id: true },
    });
    const recoveryCase =
      existingCase ||
      (await tx.recoveryCase.create({
        data: {
          invoiceId: invoice.id,
          ownerUserId: merchantId,
          status: "OPEN",
          stage: "INGESTED",
          amountAtRisk: input.amount,
        },
        select: { id: true },
      }));

    await tx.revenueEvent.update({
      where: { id: eventId },
      data: {
        recoveryCaseId: recoveryCase.id,
        status: existingCase ? "CASE_ATTACHED" : "CASE_CREATED",
        normalizedAt: new Date(),
      },
    });

    return {
      status: "accepted" as const,
      eventId,
      recoveryCaseId: recoveryCase.id,
      caseDisposition: existingCase ? ("attached" as const) : ("created" as const),
    };
  });
}

async function processPersistedRevenueEvent(args: {
  merchantId: string;
  eventId: number;
  input: RevenueEventInput;
  normalized: NormalizedRevenueEvent;
}): Promise<IngestRevenueEventResult> {
  const { merchantId, eventId, input, normalized } = args;
  if (normalized.quarantine) {
    return recordQuarantine({ eventId, ...normalized.quarantine });
  }

  try {
    return await linkEventToRecoveryCase({ merchantId, eventId, input, normalized });
  } catch (error) {
    if (error instanceof RevenueEventProcessingError) {
      return recordQuarantine({ eventId, code: error.code, message: error.message });
    }

    const message = error instanceof Error ? error.message : "Unable to create recovery case";
    await prisma.$transaction([
      prisma.revenueEvent.update({
        where: { id: eventId },
        data: { status: "PROCESSING_FAILED", normalizedAt: new Date() },
      }),
      prisma.eventIngestionError.create({
        data: { revenueEventId: eventId, code: "PROCESSING_FAILED", message, severity: "ERROR" },
      }),
    ]);
    throw error;
  }
}

/**
 * Persist, normalize and safely link an external revenue-at-risk signal.
 *
 * Ingestion itself never sends a message, retries a payment, or records money.
 * It creates/attaches the central RecoveryCase only after the raw event has
 * been persisted, so downstream scoring and execution remain separately
 * guarded. Confirmed settlement is still the only source of recovered cash.
 */
export async function ingestRevenueEvent(
  merchantId: string,
  input: RevenueEventInput,
): Promise<IngestRevenueEventResult> {
  const normalized = normalizeEvent(input);
  const where = {
    merchantId,
    source: input.source,
    sourceEventId: input.sourceEventId,
  };
  const existing = await prisma.revenueEvent.findFirst({
    where,
    select: { id: true, recoveryCaseId: true },
  });
  if (existing) {
    return { status: "duplicate", eventId: existing.id, recoveryCaseId: existing.recoveryCaseId };
  }

  try {
    const event = await prisma.revenueEvent.create({
      data: {
        ...where,
        eventType: normalized.eventType,
        customerId: normalized.customerId,
        amount: input.amount,
        currency: input.currency.toUpperCase(),
        failureCode: normalized.failureCode,
        failureReason: input.failureReason,
        rawPayload: toInputJson(storedRawPayload(input)),
        status: "PENDING",
        payload: {
          create: {
            payload: toInputJson(storedRawPayload(input)),
            schemaVersion: 1,
          },
        },
      },
      select: { id: true },
    });
    return processPersistedRevenueEvent({ merchantId, eventId: event.id, input, normalized });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    // A concurrent retry from the same merchant is idempotent. A collision
    // outside this scope is deliberately opaque so it cannot reveal another
    // tenant's event record.
    const racedEvent = await prisma.revenueEvent.findFirst({
      where,
      select: { id: true, recoveryCaseId: true },
    });
    if (racedEvent) {
      return {
        status: "duplicate",
        eventId: racedEvent.id,
        recoveryCaseId: racedEvent.recoveryCaseId,
      };
    }
    throw new RevenueEventConflictError();
  }
}

/**
 * Re-run stored event processing without inserting a second raw event. This is
 * intentionally safe for demo/admin use: it only creates/links local case
 * records and never invokes the recovery execution engine.
 */
export async function replayRevenueEvent(
  merchantId: string,
  eventId: number,
): Promise<IngestRevenueEventResult | null> {
  const event = await prisma.revenueEvent.findFirst({
    where: { id: eventId, merchantId },
    select: {
      id: true,
      source: true,
      sourceEventId: true,
      eventType: true,
      customerId: true,
      amount: true,
      currency: true,
      failureCode: true,
      failureReason: true,
      rawPayload: true,
    },
  });
  if (!event) return null;

  const storedPayload =
    event.rawPayload && typeof event.rawPayload === "object" && !Array.isArray(event.rawPayload)
      ? (event.rawPayload as Record<string, unknown>)
      : {};
  const occurredAt = sourceOccurredAt(storedPayload);
  const payload = { ...storedPayload };
  delete payload[RAW_EVENT_METADATA_KEY];
  const input: RevenueEventInput = {
    source: event.source,
    sourceEventId: event.sourceEventId,
    eventType: event.eventType,
    customerId: event.customerId || undefined,
    amount: Number(event.amount),
    currency: event.currency,
    occurredAt,
    failureCode: event.failureCode || undefined,
    failureReason: event.failureReason || undefined,
    payload,
  };
  const normalized = normalizeEvent(input);
  return processPersistedRevenueEvent({ merchantId, eventId: event.id, input, normalized });
}

/** Exported for deterministic module-A tests and CSV/batch adapters. */
export function normalizeRevenueEvent(input: RevenueEventInput): NormalizedRevenueEvent {
  return normalizeEvent(input);
}

/**
 * Parses the intentionally small, documented demo CSV format used by Module A.
 * Quoted cells and escaped quotes follow RFC 4180 so a JSON payload can safely
 * live in the final `payload` column without relying on a spreadsheet library.
 */
function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (quoted) {
    throw new RevenueEventValidationError("INVALID_CSV", "CSV contains an unclosed quoted field");
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

const CSV_HEADERS = [
  "source",
  "sourceEventId",
  "eventType",
  "customerId",
  "amount",
  "currency",
  "occurredAt",
  "failureCode",
  "failureReason",
  "payload",
] as const;

/**
 * Converts a CSV batch into the exact same validated input records as JSON.
 * Required columns are source, sourceEventId, eventType, customerId and amount;
 * currency defaults to INR and payload defaults to an empty object.
 */
export function parseRevenueEventCsv(csv: string): RevenueEventInput[] {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) {
    throw new RevenueEventValidationError("INVALID_CSV", "CSV must include a header and at least one event row");
  }

  const header = rows[0].map((cell) => cell.replace(/^\uFEFF/, "").trim());
  const indexByHeader = new Map(header.map((name, index) => [name, index]));
  const missing = CSV_HEADERS.slice(0, 5).filter((name) => !indexByHeader.has(name));
  if (missing.length) {
    throw new RevenueEventValidationError(
      "INVALID_CSV_HEADER",
      `CSV is missing required columns: ${missing.join(", ")}`,
    );
  }

  return rows.slice(1).map((row, rowOffset) => {
    const line = rowOffset + 2;
    const value = (name: (typeof CSV_HEADERS)[number]) => {
      const index = indexByHeader.get(name);
      return index === undefined ? undefined : row[index] || undefined;
    };
    let payload: Record<string, unknown> = {};
    const payloadText = value("payload");
    if (payloadText) {
      try {
        const parsed: unknown = JSON.parse(payloadText);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("payload must be a JSON object");
        }
        payload = parsed as Record<string, unknown>;
      } catch (error) {
        throw new RevenueEventValidationError(
          "INVALID_CSV_PAYLOAD",
          `Line ${line}: ${error instanceof Error ? error.message : "invalid payload JSON"}`,
        );
      }
    }

    try {
      return revenueEventInputSchema.parse({
        source: value("source"),
        sourceEventId: value("sourceEventId"),
        eventType: value("eventType"),
        customerId: value("customerId"),
        amount: Number(value("amount")),
        currency: value("currency") || "INR",
        occurredAt: value("occurredAt"),
        failureCode: value("failureCode"),
        failureReason: value("failureReason"),
        payload,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new RevenueEventValidationError("INVALID_CSV_EVENT", `Line ${line}: event validation failed`);
      }
      throw error;
    }
  });
}

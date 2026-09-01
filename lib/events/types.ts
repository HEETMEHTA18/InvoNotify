// ── Invoice Lifecycle Events ──────────────────────────────────────────────────

export type InvoiceCreatedEvent = {
  type: "invoice.created";
  source: "api" | "import" | "webhook";
  invoiceId: number;
  ownerUserId: string | null;
  payload: Record<string, unknown>;
};

export type InvoiceOverdueEvent = {
  type: "invoice.overdue";
  source: "cron" | "api";
  invoiceId: number;
  daysOverdue: number;
  payload: Record<string, unknown>;
};

export type InvoicePaidEvent = {
  type: "invoice.paid";
  source: "razorpay" | "stripe" | "manual";
  invoiceId: number;
  amountPaid: number;
  payload: Record<string, unknown>;
};

// ── Razorpay Events ──────────────────────────────────────────────────────────

export type RazorpayPaymentLinkEvent = {
  type:
    | "payment_link.paid"
    | "payment_link.partially_paid"
    | "payment_link.expired"
    | "payment_link.cancelled";
  source: "razorpay";
  payload: Record<string, unknown>;
  razorpayEventId: string;
};

export type RazorpayPaymentEvent = {
  type: "payment.captured" | "payment.failed" | "payment.authorized";
  source: "razorpay";
  payload: Record<string, unknown>;
  razorpayEventId: string;
};

// ── Recovery Events ──────────────────────────────────────────────────────────

export type RecoveryCaseCreatedEvent = {
  type: "recovery.case_created";
  source: "orchestrator" | "webhook" | "cron";
  invoiceId: number;
  recoveryCaseId: number;
  riskScore: number;
  payload: Record<string, unknown>;
};

export type RecoveryActionExecutedEvent = {
  type: "recovery.action_executed";
  source: "orchestrator";
  invoiceId: number;
  recoveryCaseId: number;
  actionType: string;
  policyResult: string;
  executionStatus: string;
  payload: Record<string, unknown>;
};

export type RecoveryCaseResolvedEvent = {
  type: "recovery.case_resolved";
  source: "webhook" | "orchestrator";
  invoiceId: number;
  recoveryCaseId: number;
  resolvedBy: "payment" | "manual" | "timeout";
  payload: Record<string, unknown>;
};

// ── Union Type ───────────────────────────────────────────────────────────────

export type AppEvent =
  | InvoiceCreatedEvent
  | InvoiceOverdueEvent
  | InvoicePaidEvent
  | RazorpayPaymentLinkEvent
  | RazorpayPaymentEvent
  | RecoveryCaseCreatedEvent
  | RecoveryActionExecutedEvent
  | RecoveryCaseResolvedEvent;

export type EventType = AppEvent["type"];
export type EventSource = AppEvent["source"];

// ── Event Handler Types ──────────────────────────────────────────────────────

export type EventHandler<T extends AppEvent = AppEvent> = {
  (event: T): Promise<void>;
};

export type EventSubscription = {
  eventType: EventType;
  handler: EventHandler;
  id: string;
};

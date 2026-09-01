# Event System

> In-memory event bus connecting invoice/payment events to the AI recovery system.

---

## 1. Overview

The event system provides decoupled communication between system layers:

```
Event Sources              Event Bus              Event Handlers
-----------              ---------              --------------
Razorpay Webhook    -->                    -->  Recovery Workflow
Stripe Webhook      -->   lib/events/bus.ts -->  (closes cases, triggers sweep)
Invoice API         -->                    -->  (creates recovery cases)
Cron Jobs           -->                    -->  (triggers recovery sweep)
```

**Location:** `lib/events/`

---

## 2. Files

| File | Purpose |
|------|---------|
| `lib/events/types.ts` | Event type definitions |
| `lib/events/bus.ts` | In-memory event bus with audit |
| `lib/events/workflows/recovery.ts` | Recovery event handlers |
| `lib/events/index.ts` | Barrel exports |

---

## 3. Event Types

### Invoice Events

| Event Type | Source | When |
|------------|--------|------|
| `invoice.created` | api, import, webhook | New invoice created |
| `invoice.overdue` | cron, api | Invoice passed due date |
| `invoice.paid` | razorpay, stripe, manual | Invoice fully paid |

### Razorpay Events

| Event Type | Source | When |
|------------|--------|------|
| `payment_link.paid` | razorpay | Customer completed payment |
| `payment_link.partially_paid` | razorpay | Partial payment received |
| `payment_link.expired` | razorpay | Payment link expired |
| `payment_link.cancelled` | razorpay | Merchant cancelled link |
| `payment.captured` | razorpay | Payment captured successfully |
| `payment.failed` | razorpay | Payment attempt failed |

### Recovery Events

| Event Type | Source | When |
|------------|--------|------|
| `recovery.case_created` | orchestrator, webhook, cron | New recovery case opened |
| `recovery.action_executed` | orchestrator | Recovery action completed |
| `recovery.case_resolved` | webhook, orchestrator | Case closed (paid/manual) |

---

## 4. Event Bus API

### Subscribe to Events

```typescript
import { onEvent } from "@/lib/events";

// Subscribe to a specific event type
const unsubscribe = onEvent("invoice.overdue", async (event) => {
  console.log(`Invoice ${event.invoiceId} is ${event.daysOverdue} days overdue`);
  // Trigger recovery sweep
});

// Unsubscribe later
unsubscribe();
```

### Emit Events

```typescript
import { emitEvent, emitEventAsync } from "@/lib/events";

// Await completion (handlers run in parallel)
await emitEvent({
  type: "invoice.paid",
  source: "razorpay",
  invoiceId: 1024,
  amountPaid: 24500,
  payload: { paymentId: "pay_xxx" },
});

// Fire-and-forget (non-blocking)
emitEventAsync({
  type: "invoice.overdue",
  source: "cron",
  invoiceId: 1024,
  daysOverdue: 7,
  payload: {},
});
```

### Query Event Log

```typescript
import { getEventLog } from "@/lib/events";

// Get recent events
const events = await getEventLog({ limit: 50 });

// Filter by type
const overdueEvents = await getEventLog({
  type: "invoice.overdue",
  since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
});
```

---

## 5. Recovery Workflows

**Location:** `lib/events/workflows/recovery.ts`

### Registered Handlers

| Event | Handler | Action |
|-------|---------|--------|
| `invoice.overdue` | Runs recovery sweep | Creates recovery case, executes actions |
| `invoice.paid` | Closes recovery case | Marks case as PAID, skips pending actions |
| `payment_link.paid` | Closes recovery case | Same as invoice.paid |
| `payment_link.expired` | Schedules follow-up | Reopens case, sets nextActionAt +1hr |
| `payment.failed` | Logs failure | Creates retry action scheduled +24hr |

### Initialization

```typescript
import { initRecoveryWorkflows } from "@/lib/events";

// Call once at app startup
initRecoveryWorkflows();
```

### Workflow Details

#### Invoice Overdue -> Recovery

```
invoice.overdue event
  -> runRecoverySweep({ invoiceId, trigger: "WEBHOOK" })
    -> For each overdue invoice:
       -> buildRecoveryContext()
       -> decideRecoveryAction()
       -> evaluatePolicy()
       -> executeAction()
       -> Log AgentAction
```

#### Payment Received -> Case Closed

```
invoice.paid event
  -> resolveRecoveryCaseForPaidInvoice(invoiceId)
    -> Update RecoveryCase: status=PAID, stage=RESOLVED
    -> Update pending AgentActions: status=SKIPPED
```

#### Payment Link Expired -> Re-engagement

```
payment_link.expired event
  -> Find RecoveryCase for invoice
  -> Reopen: status=OPEN, stage=EXECUTION
  -> Schedule: nextActionAt = now + 1 hour
```

#### Payment Failed -> Retry

```
payment.failed event
  -> Find RecoveryCase for invoice
  -> Create AgentAction: RESEND_PAYMENT_LINK, SCHEDULED
  -> Set nextActionAt = now + 24 hours
```

---

## 6. Event Bus Implementation

### Architecture

- **In-memory**: Subscriptions stored in a Map
- **Async parallel**: All handlers run via `Promise.allSettled`
- **Error resilient**: Handler failures are caught and logged, never block caller
- **Audit trail**: Every emitted event is stored in `WebhookEvent` table

### Persistence

Events are stored in `WebhookEvent` with `source: "event-bus"` for audit:

```typescript
{
  eventId: "evt_1724025600_abc123",
  eventType: "invoice.overdue",
  payload: { type: "invoice.overdue", invoiceId: 1024, ... },
  source: "event-bus",
  status: "PROCESSED",
  processedAt: new Date()
}
```

### Production Upgrade Path

For production, replace the in-memory bus with:

- **Redis Streams** (recommended for Next.js + Vercel)
- **RabbitMQ** (if self-hosting)
- **AWS SQS** (if on AWS)

The `onEvent` / `emitEvent` API stays the same.

---

## 7. Integration Points

### Razorpay Webhook -> Event Bus

```typescript
// app/api/webhooks/razorpay/route.ts
await emitEvent({
  type: event.event as AppEvent["type"],
  source: "razorpay",
  payload: event,
  razorpayEventId,
});
```

### Stripe Webhook -> Event Bus

The existing Stripe webhook handler already calls `resolveRecoveryCaseForPaidInvoice()` directly. This can be migrated to use the event bus.

### Cron -> Event Bus

```typescript
// Future: cron job emits overdue events
await emitEvent({
  type: "invoice.overdue",
  source: "cron",
  invoiceId: invoice.id,
  daysOverdue: daysSinceDue,
  payload: {},
});
```

---

## 8. Event Type Definitions

```typescript
// Core event type
type AppEvent =
  | InvoiceCreatedEvent
  | InvoiceOverdueEvent
  | InvoicePaidEvent
  | RazorpayPaymentLinkEvent
  | RazorpayPaymentEvent
  | RecoveryCaseCreatedEvent
  | RecoveryActionExecutedEvent
  | RecoveryCaseResolvedEvent;

// Handler signature
type EventHandler<T extends AppEvent> = (event: T) => Promise<void>;

// Subscription
type EventSubscription = {
  eventType: EventType;
  handler: EventHandler;
  id: string;
};
```

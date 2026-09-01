# Razorpay Integration Guide

> Complete reference for the Razorpay payment integration in InvoNotify AI.

---

## 1. Overview

InvoNotify integrates with Razorpay for:
- **Payment Links** — Create, fetch, resend, cancel payment links for invoices
- **Webhooks** — Real-time payment status updates (paid, expired, failed)
- **Revenue Recovery** — AI-driven payment link creation as recovery action

---

## 2. Configuration

### Environment Variables

```bash
# Razorpay Test Mode
RAZORPAY_KEY_ID="rzp_test_YOUR_KEY_ID"
RAZORPAY_KEY_SECRET="YOUR_KEY_SECRET"
RAZORPAY_WEBHOOK_SECRET="YOUR_WEBHOOK_SECRET"
```

### Getting Test Keys

1. Go to https://dashboard.razorpay.com/app/keys
2. Switch to **Test Mode**
3. Copy your `Key ID` and `Key Secret`
4. Go to https://dashboard.razorpay.com/app/settings/webhooks
5. Add a webhook URL: `https://your-domain.com/api/webhooks/razorpay`
6. Select events: `payment_link.paid`, `payment_link.expired`, `payment.captured`, `payment.failed`
7. Copy the webhook secret

---

## 3. API Client (`lib/razorpay.ts`)

### Authentication
- Uses Basic Auth: `base64(KEY_ID:KEY_SECRET)`
- No SDK dependency — raw `fetch()` calls

### Payment Link Operations

```typescript
import { createPaymentLink, fetchPaymentLink, cancelPaymentLink, resendPaymentLink } from "@/lib/razorpay";

// Create a payment link
const link = await createPaymentLink({
  amount: 24500,          // Amount in rupees (converted to paise internally)
  currency: "INR",
  description: "Payment for Invoice #INV-1024",
  customer: {
    name: "ABC Technologies",
    email: "accounts@abctech.com",
    contact: "+919876543210",
  },
  notify: { email: true, sms: false, whatsapp: false },
  reference_id: "1024",   // Invoice ID (used to link webhook events)
  callback_url: "https://your-domain.com/api/webhooks/razorpay",
  callback_method: "post",
});

// Returns: { id, short_url, status, amount, currency, ... }
```

### Types

```typescript
type RazorpayPaymentLink = {
  id: string;                    // "pl_xxx"
  entity: "payment_link";
  amount: number;                // In paise
  amount_paid: number;           // In paise
  currency: string;
  description: string | null;
  status: "created" | "partial" | "paid" | "expired" | "cancelled";
  customer: { name, email, contact } | null;
  short_url: string | null;      // "https://rzp.io/x/xxx"
  reference_id: string | null;   // Your invoice ID
  created_at: number;
  updated_at: number;
  payments_count: number;
  payments_amount: number;
};
```

---

## 4. Webhook Handler (`app/api/webhooks/razorpay/route.ts`)

### Endpoint
```
POST /api/webhooks/razorpay
```

### Security
1. Reads `x-razorpay-signature` header
2. Verifies HMAC-SHA256 signature against `RAZORPAY_WEBHOOK_SECRET`
3. Rejects requests with invalid signatures (400)

### Idempotency
- Stores every event in `WebhookEvent` table with `eventId` (unique)
- Duplicate events return `{ received: true, duplicate: true }` (200)

### Handled Events

| Event | Action |
|-------|--------|
| `payment_link.paid` | Records payment, updates invoice status, closes recovery case |
| `payment_link.partially_paid` | Records partial payment, updates invoice balance |
| `payment_link.expired` | Clears payment link from invoice, logs event |
| `payment_link.cancelled` | Clears payment link from invoice, logs event |
| `payment.captured` | Records payment, updates invoice, closes recovery case |
| `payment.failed` | Logs failure event for audit |

### Payment Recording Flow

```
Webhook received
    │
    ▼
Verify signature
    │
    ▼
Check eventId (idempotency)
    │
    ▼
Store WebhookEvent
    │
    ▼
Parse event type
    │
    ├─ payment_link.paid ─────────────────────────────┐
    │                                                  │
    │   Find invoice by reference_id                   │
    │   Record PaymentEvent                            │
    │   Prisma transaction:                            │
    │     ├─ Check duplicate payment (transactionId)   │
    │     ├─ Create Payment record                     │
    │     ├─ Update Invoice (amountPaid, balance)      │
    │     └─ Update status to "Paid" if balance ≤ 0   │
    │                                                  │
    ├─ payment_link.expired ───────────────────────────┤
    │   Clear razorpayPaymentLinkId from invoice       │
    │                                                  │
    ├─ payment.captured ───────────────────────────────┤
    │   Same as payment_link.paid but via payment API  │
    │                                                  │
    └─ payment.failed ─────────────────────────────────┘
        Log failure for audit trail
              │
              ▼
    Emit event to Event Bus
              │
              ▼
    Close Recovery Case (if payment successful)
```

---

## 5. Payment Links API

### List Payment Links
```
GET /api/razorpay/payment-links
GET /api/razorpay/payment-links?invoiceId=1024
```

**Response:**
```json
{
  "invoices": [{
    "id": 1024,
    "invoiceNumber": "INV-1024",
    "clientName": "ABC Technologies",
    "clientEmail": "accounts@abctech.com",
    "balance": 24500,
    "currency": "INR",
    "razorpayPaymentLinkId": "pl_xxx",
    "razorpayPaymentLinkUrl": "https://rzp.io/x/xxx",
    "status": "Pending"
  }]
}
```

### Create Payment Link
```
POST /api/razorpay/payment-links
Content-Type: application/json

{ "invoiceId": 1024 }
```

**Response:**
```json
{
  "paymentLinkId": "pl_xxx",
  "shortUrl": "https://rzp.io/x/xxx",
  "status": "created",
  "amount": 24500,
  "currency": "INR"
}
```

**Error: 409** — Invoice already has an active payment link

### Fetch Payment Link
```
GET /api/razorpay/payment-links/1024
```

**Response:**
```json
{
  "invoiceId": 1024,
  "invoiceNumber": "INV-1024",
  "paymentLinkId": "pl_xxx",
  "shortUrl": "https://rzp.io/x/xxx",
  "status": "paid",
  "amount": 24500,
  "amountPaid": 24500,
  "currency": "INR",
  "paymentsCount": 1,
  "createdAt": 1724025600,
  "updatedAt": 1724029200
}
```

### Resend Payment Link
```
POST /api/razorpay/payment-links/1024
Content-Type: application/json

{ "action": "resend" }
```

### Cancel Payment Link
```
POST /api/razorpay/payment-links/1024
Content-Type: application/json

{ "action": "cancel" }

-- or --

DELETE /api/razorpay/payment-links/1024
```

---

## 6. Database Tables

### Invoice (extended)
```sql
ALTER TABLE "Invoice"
  ADD COLUMN "razorpayPaymentLinkId" TEXT,
  ADD COLUMN "razorpayPaymentLinkUrl" TEXT,
  ADD COLUMN "razorpayPaymentId" TEXT;

CREATE INDEX "Invoice_razorpayPaymentLinkId_idx"
  ON "Invoice"("razorpayPaymentLinkId");
```

### PaymentEvent
```sql
CREATE TABLE "PaymentEvent" (
  id              SERIAL PRIMARY KEY,
  invoiceId       INTEGER NOT NULL REFERENCES "Invoice"(id) ON DELETE CASCADE,
  source          TEXT NOT NULL DEFAULT 'razorpay',
  eventType       TEXT NOT NULL,
  razorpayEventId TEXT UNIQUE,
  paymentId       TEXT,
  paymentLinkId   TEXT,
  amount          DECIMAL(12,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'INR',
  status          TEXT NOT NULL DEFAULT 'RECEIVED',
  payload         JSONB,
  processedAt     TIMESTAMP(3),
  createdAt       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "PaymentEvent_invoiceId_idx" ON "PaymentEvent"("invoiceId");
CREATE INDEX "PaymentEvent_source_eventType_idx" ON "PaymentEvent"("source", "eventType");
CREATE INDEX "PaymentEvent_razorpayEventId_idx" ON "PaymentEvent"("razorpayEventId");
```

### WebhookEvent
```sql
CREATE TABLE "WebhookEvent" (
  id          SERIAL PRIMARY KEY,
  eventId     TEXT UNIQUE NOT NULL,
  eventType   TEXT NOT NULL,
  payload     JSONB,
  source      TEXT NOT NULL DEFAULT 'stripe',  -- 'razorpay' for Razorpay events
  status      TEXT NOT NULL DEFAULT 'RECEIVED',
  receivedAt  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processedAt TIMESTAMP(3),
  error       TEXT
);

CREATE UNIQUE INDEX "WebhookEvent_eventId_key" ON "WebhookEvent"("eventId");
```

---

## 7. Integration with AI Recovery

The Razorpay integration feeds directly into the AI recovery system:

1. **Recovery Action → Payment Link**: When the AI decides `CREATE_PAYMENT_LINK`, the action engine calls Razorpay `createPaymentLink()` through `lib/ai/actions/engine.ts`. The dashboard showcase never reaches this code path because it runs `dryRun: true`.

2. **Webhook → Recovery Close**: When Razorpay sends `payment_link.paid`, the webhook handler calls `resolveRecoveryCaseForPaidInvoice()` to close the recovery case

3. **Event Bus**: Razorpay events are emitted to the event bus, triggering recovery workflows

---

## 8. Testing

### Test Mode
- Razorpay provides separate Test and Live modes
- Use **Test Mode** keys only for this project; never use live keys in the
  hackathon demo
- Test cards: https://razorpay.com/docs/payments/payments/test-card-upi-details/

### Test Flow
```
1. Use a separately configured Test Mode merchant and controlled test recipient
2. Create invoice via API
3. POST /api/razorpay/payment-links { invoiceId: X }
4. Open short_url in browser
5. Complete test payment
6. Webhook fires → Payment recorded → Invoice marked Paid
7. Recovery case closed with an immutable recovery-settlement record
```

### Webhook Testing
- Use Razorpay dashboard to resend webhooks
- Or use ngrok for local development: `ngrok http 3000`
- Set webhook URL to ngrok URL + `/api/webhooks/razorpay`

---

## 9. Stripe vs Razorpay

| Feature | Stripe | Razorpay |
|---------|--------|----------|
| Payment Links | Checkout Sessions | Payment Links API |
| Webhook Signature | `stripe-signature` header | `x-razorpay-signature` header |
| Auth | Bearer token | Basic Auth |
| Currency | Auto-detected | Explicit (default INR) |
| Amount | In cents/paise | In paise |
| Events | `checkout.session.completed` | `payment_link.paid` |
| Idempotency | Event ID | Event ID |

Both are fully integrated. The system supports either provider.

---

## 10. Known Limitations

1. **Test Mode Only**: Current implementation is configured for Razorpay Test Mode
2. **Single Webhook URL**: One webhook URL for all events (no event-specific routing)
3. **No Refund Integration**: Refunds are not yet implemented
4. **No Recurring Payments**: Only one-time payment links

---

## 11. Future Enhancements

- [ ] Razorpay Subscriptions integration
- [ ] UPI payment links
- [ ] WhatsApp payment notifications
- [ ] Multi-currency support
- [ ] Webhook event replay
- [ ] Payment analytics dashboard
- [ ] Automated retry for failed payments
- [ ] Smart payment link expiry based on customer behavior

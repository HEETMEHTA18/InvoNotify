# API Reference

> Complete HTTP endpoint reference for InvoNotify AI.

---

## Authentication

All endpoints except `/api/auth/*` and `/api/webhooks/*` require an authenticated session via NextAuth.js.

---

## AI Recovery Endpoints

### List Recovery Cases

```
GET /api/ai/recovery
GET /api/ai/recovery?status=OPEN
```

Returns recovery cases with summary stats (totalAtRisk, expectedRecovery, overdueCount, paidCount, statusCounts).

### Trigger Recovery Sweep

```
POST /api/ai/recovery
Body: { "dryRun": true }
```

Rate limited: 5/min. Returns runId, totalInvoices, processed, actions,
expectedRecoveryAmount (forecast), recoveredAmount (confirmed cash), and
simulatedActions, and invoiceResults.

`dryRun: true` is the safe default used by the dashboard showcase: it records
recommendations and audit evidence without contacting a customer or provider.
Use `dryRun: false` only for a separately configured Razorpay **Test Mode**
merchant with controlled test recipients.

### Get Recovery Case Detail

```
GET /api/ai/recovery/[id]
```

Returns full case with invoice details, daysOverdue, and complete action audit trail.

### Approve Pending Action

```
POST /api/ai/recovery/[id]/approve
```

Rate limited: 10/min. Approves the latest pending action. Re-validates policy with manualApproval flag.

### AI Metrics

```
GET /api/ai/metrics
```

Returns summary (totalCases, casesLast24h, casesLast7d, totalRecovered), statusDistribution, actionBreakdown, recentRuns.

### Health Check

```
GET /api/ai/health
```

Returns status (healthy/degraded/unhealthy), checks (database, env, paymentProvider, llmConfig, modelVersion).

---

## Razorpay Endpoints

### List Payment Links

```
GET /api/razorpay/payment-links
GET /api/razorpay/payment-links?invoiceId=1024
```

### Create Payment Link

```
POST /api/razorpay/payment-links
Body: { "invoiceId": 1024 }
```

Returns paymentLinkId, shortUrl, status, amount, currency. Error 409 if link already exists.

### Fetch Payment Link

```
GET /api/razorpay/payment-links/[id]
```

### Resend/Cancel Payment Link

```
POST /api/razorpay/payment-links/[id]
Body: { "action": "resend" } or { "action": "cancel" }
```

### Cancel Payment Link

```
DELETE /api/razorpay/payment-links/[id]
```

### Razorpay Webhook

```
POST /api/webhooks/razorpay
```

No auth required. Signature verified via x-razorpay-signature header. Handles payment_link.paid, payment_link.expired, payment.captured, payment.failed.

---

## Invoice Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/invoices | List invoices (cursor pagination) |
| POST | /api/invoices | Create invoice with line items |
| GET | /api/invoices/[id] | Get single invoice |
| PUT | /api/invoices/[id] | Full update |
| PATCH | /api/invoices/[id] | Partial update |
| DELETE | /api/invoices/[id] | Delete invoice |
| POST | /api/invoices/[id]/send | Send invoice PDF via email |
| POST | /api/invoices/[id]/reminder | Send manual reminder |
| POST | /api/invoices/send-sms | Send SMS notification |
| POST | /api/invoices/bulk-import | Bulk import (JSON/YAML/Tally XML) |

---

## Customer Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/customers | List customers |
| POST | /api/customers | Create customer |
| GET | /api/customers/[id] | Get single customer |
| PUT | /api/customers/[id] | Update customer |
| DELETE | /api/customers/[id] | Delete customer |
| POST | /api/customers/bulk-import | Bulk import |
| GET | /api/customers/export | Export customer report as PDF |

---

## Product Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/products | List products |
| POST | /api/products | Create product |
| GET | /api/products/[id] | Get single product |
| PUT | /api/products/[id] | Update product |
| DELETE | /api/products/[id] | Delete product |

---

## Other Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /api/payments | Record payment against invoice |
| POST | /api/settings | Get/update company settings |
| POST | /api/settings/payment-qr/decode | Decode uploaded QR image |
| POST | /api/upload | Upload image to Cloudinary |
| POST | /api/ocr | OCR invoice image |
| POST | /api/tally-import | Parse Tally XML/YAML |
| GET | /api/reminders/auto | Automated reminder sweep |
| POST | /api/reminders/send | Send manual reminder |
| GET | /api/dashboard/stats | Dashboard KPIs and charts |
| POST | /api/stripe/checkout | Create Stripe checkout session |
| POST | /api/stripe/webhook | Stripe webhook handler |

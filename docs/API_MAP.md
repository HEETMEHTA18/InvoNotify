# API Map — InvoNotify

> Phase 0 deliverable. Every HTTP endpoint, its method, auth, and behavior.

Convention: all route handlers live under `app/api/**/route.ts`. Most require an
authenticated session via `auth()` from `lib/auth.ts` and scope queries to the
current user.

## Auth

| Method | Path | Auth | Notes |
|---|---|---|---|
| ALL | `/api/auth/[...nextauth]` | — | NextAuth v5 handlers (Google + Credentials) |

## Invoices

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/invoices` | session | List invoices for user. Query: `withItems`, `limit`, `cursor` (cursor pagination, `nextCursor` returned). Falls back to legacy schema on reminder-field errors. |
| POST | `/api/invoices` | session | Create invoice + items + GST breakdown + reminder settings. Auto-links Customer, recomputes CIBIL, fires immediate reminder if due. 409 on duplicate invoice number. |
| GET | `/api/invoices/:id` | session | Single invoice w/ items. |
| PUT | `/api/invoices/:id` | session | Full update incl. item replacement, tax recalc, reminder settings, immediate reminder. |
| PATCH | `/api/invoices/:id` | session | Partial update (e.g., status). |
| DELETE | `/api/invoices/:id` | session | Delete invoice (cascade items/payments/logs). |
| POST | `/api/invoices/:id/reminder` | session | Manual reminder for one invoice → `sendInvoiceReminderById` (`MANUAL`). |
| POST | `/api/invoices/:id/send` | session | Send invoice PDF to client email w/ Stripe checkout button. Body: `pdfBase64`, optional `htmlContent`, `subject`. |
| POST | `/api/invoices/bulk-import` | session | Bulk invoice import (YAML). |
| POST | `/api/invoices/send-sms` | session | Send SMS reminder. **SMS is disabled** → 503 in practice. |

## Customers

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/customers` | session | List customers enriched w/ computed CIBIL, overdue counts, totals. Back-fills `customerId` links, sets status `Overdue`, persists score deltas. |
| POST | `/api/customers` | session | Create (or upsert by name) customer. |
| GET/PUT/DELETE | `/api/customers/:id` | session | Single customer CRUD. |
| POST | `/api/customers/bulk-import` | session | Bulk customer import. |
| GET | `/api/customers/export` | session | Customer export. |

## Products

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET/POST | `/api/products` | session | List/create products. |
| GET/PUT/DELETE | `/api/products/:id` | session | Product CRUD. |

## Payments

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/payments` | session | Record manual payment in a Prisma transaction: create Payment, update invoice amountPaid/balance/status (`Paid` when balance ≤ 0). |

## Dashboard

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/dashboard/stats` | session | KPIs, revenue buckets (`hour`/`day`/`month`), status distribution, high-risk customer groups, recent activity. Heavy raw SQL. |

## Reminders (cron + manual)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET/POST | `/api/reminders/auto` | `CRON_SECRET` bearer/header OR session | Sweep eligible invoices, compute reminder matches, send, log. `?manual=true` / `{manual:true}` → current-user scope only. Idempotent via `InvoiceReminderLog`. |
| POST | `/api/reminders/send` | session | Manual reminder for `invoiceId` (`MANUAL`). |

## Settings

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET/PUT | `/api/settings` | session | Company settings (logo, QR payload, etc.). |
| POST | `/api/settings/payment-qr/decode` | session | Decode UPI QR payload. |

## Payments providers — Stripe (the template for Razorpay)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/stripe/checkout` | session | Create Stripe Checkout Session for invoice balance. Returns `{url}`. Validates invoice ownership + positive balance. |
| POST | `/api/stripe/webhook` | webhook signature | `runtime = "nodejs"`. Custom HMAC signature verification (`stripe-signature` header, timestamp tolerance 5 min). Handles `checkout.session.completed` (only when `payment_status=paid`) and `payment_intent.succeeded`. Dedups by `transactionId` existence check, then creates Payment + updates invoice in a transaction. |

## Misc

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/ocr` | session | OCR extraction. |
| POST | `/api/tally-import` | session | Tally/YAML import. |
| POST | `/api/upload` | session | Cloudinary upload. |

## Security model summary

- Session enforcement: `auth()` inside every protected handler; 401 otherwise.
- Scoping: `{ OR: [{ ownerUserId: userId }, { userId }] }` on Invoice;
  `{ ownerUserId: userId }` on Customer/Product. **New code should use `ownerUserId` only.**
- Cron: `CRON_SECRET` (or legacy `REMINDER_CRON_SECRET`) compared against
  bearer token or `x-cron-secret` header. **Fails closed if secret unset.**
- Webhook: Stripe HMAC verified; unknown events ignored (200 `{received:true}`).
- Headers: `proxy.ts` applies CSP/HSTS/etc. on `/api`, `/dashboard`, `/docs`.

## Gaps for the Razorpay Buildathon

1. No Razorpay Payment Link / Orders / Webhook endpoints.
2. No `WebhookEvent` persistence table or event-ID dedup.
3. No recovery/agent endpoints (run recovery, list agent actions, decision
   explainability, policy review queue).
4. No public customer-facing pay-page route that is reachable (the `/invoice/*`
   redirect in `next.config.ts` currently reroutes to an authed dashboard).
5. No `runtime = "edge"` anywhere — all handlers are Node (serverless default).
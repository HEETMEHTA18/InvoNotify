# Codebase Map — InvoNotify

> Phase 0 deliverable. Every meaningful file, its role, and what owns it.

## Top-level layout

```
app/            Next.js App Router: pages + API route handlers
components/     Shared UI + feature components (dashboard, docs, landing, ui)
lib/            Auth, DB, reminders, messaging, PDF, payment helpers
prisma/         Schema + migrations
scripts/        Operational scripts (automation / maintenance / integration)
data/           Bulk import fixtures (hardware company YAML demo data)
Documentation/  Product/SRS/architecture docs
logs/           Runtime logs
proxy.ts        Next 16 middleware replacement — security headers
next.config.ts  Next config (redirects, images, server actions)
```

## `lib/` — shared logic (the heart of the backend)

| File | Role |
|---|---|
| `lib/db.ts` | Prisma client singleton + `isPrismaDbConnectionError` guard. |
| `lib/auth.ts` | NextAuth v5 config: Google OAuth + Credentials, JWT strategy, Prisma adapter. |
| `lib/reminders.ts` | Pure reminder-matching logic: offsets, overdue repeats, subject builder. |
| `lib/mail-service.ts` | Orchestrates a reminder send: loads invoice, builds PDF, sends via Gmail, mirrors to Telegram, attaches Stripe checkout URL + UPI QR. |
| `lib/gmail.ts` | Gmail API client (OAuth from DB or env fallback) + MIME email send w/ PDF attachment. |
| `lib/stripe.ts` | Stripe secret/webhook secret getters + `createStripeCheckoutUrl` (form-encoded fetch, no SDK). |
| `lib/sms.ts` | SMS send — **disabled/fail-closed**. Throws unless Twilio configured AND enabled. |
| `lib/telegram.ts` | Optional Telegram mirror notification. |
| `lib/customer-credit.ts` | Rule-based CIBIL-like score from invoice history; status derivation (`deriveInvoiceStatus`, `getOverdueDays`); `normalizeCustomerKey`. |
| `lib/customer-schema.ts` | Schema repair for legacy Customer table. |
| `lib/customer-pdf.ts` | Customer statement PDF. |
| `lib/pdf.ts` | `generateInvoicePDFBuffer` for invoice PDFs. |
| `lib/templates.ts` | HTML reminder/invoice email templates. |
| `lib/payment-qr.ts` | UPI payment payload build/validation. |
| `lib/bank-qr-fallback.ts` | Fallback static UPI payload. |
| `lib/cloudinary.ts` | Cloudinary upload helper. |
| `lib/docs.ts`, `lib/docs-config.ts`, `lib/docs-routing.ts` | Internal `/docs` content system. |
| `lib/utils.ts`, `lib/animations.ts`, `lib/hooks.ts`, `lib/landing-constants.ts` | UI helpers. |

## `app/` — pages and API routes

### Pages
- `app/page.tsx` → redirect/landing entry
- `app/landing/page.tsx` — marketing landing
- `app/login/*`, `app/register/*` — auth UI (client components + server actions)
- `app/dashboard/page.tsx` — main dashboard (KPIs, charts, risk table)
- `app/dashboard/invoices/*` — invoice list, create, actions
- `app/dashboard/customers/*` — customer list/detail
- `app/dashboard/products/page.tsx`
- `app/dashboard/settings/page.tsx`
- `app/dashboard/profile/page.tsx`
- `app/invoice/[id]/page.tsx` — invoice detail + Pay (Stripe) UI (client)
- `app/docs/*` — docs viewer

### API route handlers (full list in `API_MAP.md`)

- `app/api/auth/[...nextauth]/route.ts`
- `app/api/invoices/route.ts`, `app/api/invoices/[id]/route.ts`,
  `app/api/invoices/[id]/reminder/route.ts`, `app/api/invoices/[id]/send/route.ts`,
  `app/api/invoices/bulk-import/route.ts`, `app/api/invoices/send-sms/route.ts`
- `app/api/customers/route.ts`, `[id]`, `bulk-import`, `export`
- `app/api/payments/route.ts`
- `app/api/products/route.ts`, `[id]`
- `app/api/dashboard/stats/route.ts`
- `app/api/reminders/auto/route.ts`, `app/api/reminders/send/route.ts`
- `app/api/settings/route.ts`, `app/api/settings/payment-qr/decode/route.ts`
- `app/api/stripe/checkout/route.ts`, `app/api/stripe/webhook/route.ts`
- `app/api/ocr/route.ts`, `app/api/tally-import/route.ts`, `app/api/upload/route.ts`

## `components/` — UI

- `components/ui/*` — base primitives (button, card, dialog, input, etc.)
- `components/dashboard/*` — DashboardStats, RiskTable, AnalyticsCharts, sidebar, user nav
- `components/customers/CibilMeter.tsx`
- `components/landing/*` — marketing sections
- `components/docs/*` — docs sidebar + markdown renderer

## `scripts/`

- `scripts/automation/run-reminders.js` + `.bat` — local cron launcher → `/api/reminders/auto`
- `scripts/maintenance/check-db.ts`, `clear-db.ts`, `clear-invoices-only.ts`
- `scripts/integration/sarvam-voice.js`, `sarvam-vision.js` — Sarvam AI TTS/vision utilities (not wired into app)

## `data/`

YAML fixtures for bulk imports (hardware wholesale demo customers/invoices).

## Where the new work should live (ownership boundaries for agents)

| New workstream | Recommended location |
|---|---|
| Razorpay client + webhook | `lib/razorpay.ts`, `app/api/razorpay/...`, `app/api/webhooks/razorpay/route.ts` |
| Event system | `lib/events/` (or `lib/workflows/`) |
| ML risk model | `ai/ml/` (Python training) + `lib/risk/` (TS inference wrapper) |
| LLM decision agent | `ai/agent/`, `ai/prompts/`, `ai/tools/` |
| Policy engine | `lib/policy/` |
| Action engine | `lib/actions/` |
| Recovery orchestrator | `lib/recovery/` |
| Dashboard/recovery UI | `app/dashboard/recovery/*`, `components/dashboard/` |
| DB schema additions | `prisma/schema.prisma` (append models only) |
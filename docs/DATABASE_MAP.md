# Database Map — InvoNotify (Prisma + PostgreSQL)

> Phase 0 deliverable. Current schema (`prisma/schema.prisma`), models, indexes,
> and what to add for the Razorpay AI revenue-recovery build.

## Connection & client

- `DATABASE_URL` (Prisma), `DIRECT_URL` (direct). Provider `postgresql`.
- Client generated as `prisma-client-js`; singleton in `lib/db.ts` (dev hot-reload guard).
- Migrations in `prisma/migrations/**` (11 migrations, initial → cibil_score).
- `@prisma/extension-accelerate` installed (Prisma Accelerate) but not configured in client init.

## Models

### Auth (NextAuth Prisma adapter)
- `User` — id (cuid), name, email (unique), emailVerified, image, password (bcrypt for Credentials), accounts/sessions/invoices/customers/products.
- `Account` — OAuth tokens; `@@id([provider, providerAccountId])`; used by `lib/gmail.ts` for Gmail API access.
- `Session`, `VerificationToken`, `Authenticator` — Auth.js plumbing.

### Core business

**Invoice** (`@@index` on date, status, [status,dueDate], [status,date], [clientEmail,clientName], [autoReminderEnabled,dueDate,status], ownerUserId, userId; `@@unique([invoiceNumber, ownerUserId])`)
- Money: `amount`, `subtotal`, `tax`, `total` (Decimal 10,2), `discount`, `taxRate`, GST split (`cgst`/`sgst`/`igst`/`gstType`).
- Payment state: `amountPaid`, `balance`.
- Client: `customer` (legacy name), `clientName`, `clientEmail`, `clientAddress`, `clientPhone`.
- Sender: `senderName`, `senderEmail`, `senderAddress`.
- Dates: `date`, `dueDate?`, `createdAt`, `updatedAt`.
- Status string: `"Draft" | "Pending" | "Paid" | "Overdue" | "Cancelled"` (free-form string, no enum).
- Ownership: `ownerUserId?` + legacy `userId?`. Link: `customerId?` → Customer.
- Reminders: `autoReminderEnabled`, `reminderOffsets Int[]`, `overdueReminderEnabled`, `overdueReminderEveryDays`, `reminderChannel` (`EMAIL|SMS|BOTH`).
- Relations: `items`, `reminderLogs`, `payments`.

**InvoiceItem** — description, quantity, rate, amount, `hsnCode?`, `invoiceId` (cascade).

**Customer** (`@@index` ownerUserId, [ownerUserId,name], [ownerUserId,cibilScore]; `@@unique([name, ownerUserId])`)
- `name`, `group?`, `openingBalance`, `address/city/state/country/gstin/phone/email?`, `firstInvoiceAt?`, `isVipExempt`, `communicationOptOut` (Boolean, default false; compliance opt-out — blocks every customer-contact action in the policy engine), `cibilScore` (Int, default 650; rule-based, recomputed on invoice create/list), `ownerUserId?`.

**CompanySettings** — `userId` unique, logo, signature, address/email/name/phone, `paymentQrEnabled`, `paymentQrPayload`.

**Product** — name, description, basePrice, hsnCode, defaultTaxRate, `ownerUserId?`.

### Payments & reminders
- **Payment** — `invoiceId`, `amount`, `date`, `method` ("Manual"/"Stripe Checkout (…)"), `transactionId?`, `note?`. **No unique index on transactionId** (Stripe dedup is app-level).
- **InvoiceReminderLog** — `invoiceId`, `reminderKey`, `reminderType` (`BEFORE_DUE|DUE_DATE|OVERDUE_REPEAT|MANUAL`), `targetDate`, `sentAt`; `@@unique([invoiceId, reminderKey])` — the idempotency guard.

## Schema conventions to respect

- IDs: `Int autoincrement` for business tables, `cuid()` for `User`.
- Money: `Decimal(10,2)` (via `@db.Decimal`).
- Enums avoided — statuses/channels are strings with app-level constants
  (`lib/reminders.ts`: `REMINDER_CHANNEL_OPTIONS`, `REMINDER_OFFSET_OPTIONS`).
- Cascade delete: Invoice → items/payments/logs; User → accounts/sessions.
- Prisma raw SQL used for aggregations (`$queryRaw`) and score updates (`$executeRaw`).

## What to add (Razorpay AI build — append-only models)

Recommended new models (see `IMPLEMENTATION_PLAN.md` for full contracts):

1. **WebhookEvent** — id, `eventId` (Razorpay `x-razorpay-event-id`), `eventType`,
   `payload` (Json), `receivedAt`, `processedAt?`, `status`, `error?`; **`@@unique([eventId])`**.
2. **PaymentEvent** — id, `invoiceId`, `eventType` (`payment_link.paid`,
   `payment_link.partially_paid`, `payment_link.expired`, `payment_link.cancelled`,
   `payment.failed`, …), `amount`, `transactionId?`, `source`, `timestamp`.
   Normalized AI dataset source.
3. **AgentRun** — id, `userId`, `trigger` (cron/manual/webhook), `status`,
   `summary` (Json), `startedAt`, `completedAt?`.
4. **AgentAction** — id, `agentRunId?`, `invoiceId`, `userId`, `riskScore`,
   `decision`, `reason`, `action` (`SEND_REMINDER|CREATE_PAYMENT_LINK|RESEND_PAYMENT_LINK|SCHEDULE_FOLLOWUP|ESCALATE|STOP`),
   `channel`, `policyResult` (ALLOW/BLOCK/HUMAN_REVIEW), `executionStatus`,
   `failureReason?`, `createdAt`, `completedAt?`. **The audit trail.**
5. **RecoveryAttempt** — id, `invoiceId`, `attemptNumber`, `strategy` (Json),
   `channel`, `outcome` (`CONTACTED|ENGAGED|PAID|FAILED|ESCALATED|...`),
   `amountRecovered?`, `paidAt?`. Drives the learning loop.

Optional: **PaymentLink** (id, `invoiceId`, `razorpayLinkId`, `shortUrl`, `status`,
`createdAt`, `expiresAt`, `paidAt?`) — persistent record of Razorpay Payment Links.

> Keep additions append-only. Do not remove/rename existing columns; existing
> routes depend on them (including legacy fallbacks).
# System Architecture - Invoice Management System

## 1. Executive Summary
This project is already a full-stack application.

- Frontend: Next.js App Router pages and React client components.
- Backend: Next.js Route Handlers under `app/api/**/route.ts`.
- Data layer: Prisma ORM with PostgreSQL.
- Auth: NextAuth v5 (Google + Credentials) with middleware protection.
- Async workflows: reminder cron jobs, manual trigger scripts, external notification providers.

Conclusion: You do not need to add a separate backend service just to make frontend data calls faster. Your backend already exists inside Next.js. First optimize this architecture before splitting into microservices.

## 2. High-Level Architecture
```mermaid
flowchart LR
    U[Browser Client] --> FE[Next.js Frontend\napp/dashboard, app/invoice, app/login]
    FE --> API[Next.js API Routes\napp/api/**/route.ts]
    API --> AUTH[NextAuth\nlib/auth.ts]
    API --> DB[(PostgreSQL)]
    API --> PRISMA[Prisma Client\nlib/db.ts]
    PRISMA --> DB

    API --> EMAIL[Gmail API / SMTP\nlib/gmail.ts]
    API --> SMS[Twilio SMS\nlib/sms.ts]
    API --> TELEGRAM[Telegram Bot\nlib/telegram.ts]
    API --> VOICE[Voice Reminders\\nComing Soon]
    API --> OCR[OCR Provider\napp/api/ocr/route.ts]

    CRON[Vercel Cron / Windows Scheduler] --> AUTO[/api/reminders/auto]
    SCRIPT[scripts/automation/run-reminders.js] --> AUTO
```

## 3. Frontend Layer
Main UI routes are in `app/` and dashboard modules in `app/dashboard/**`.

- `app/dashboard/page.tsx`: loads KPI, risk, chart data from `/api/dashboard/stats`.
- `app/dashboard/invoices/page.tsx`: invoice list and actions (delete, mark paid, reminder, SMS, imports).
- Client components use `fetch()` to call backend routes.
- Styling/UI: Tailwind CSS + reusable UI components under `components/ui/**`.

Current pattern: many dashboard pages are client-rendered and fetch after initial load.

## 4. Backend/API Layer
Backend APIs are implemented as Route Handlers in `app/api/**`.

Core domains:
- Auth: `app/api/auth/[...nextauth]/route.ts`
- Invoices: `app/api/invoices/route.ts`, `app/api/invoices/[id]/route.ts`, reminder/send endpoints
- Customers: `app/api/customers/route.ts`, bulk import
- Products: `app/api/products/route.ts`, `app/api/products/[id]/route.ts`
- Payments: `app/api/payments/route.ts`
- Dashboard analytics: `app/api/dashboard/stats/route.ts`
- Settings: `app/api/settings/route.ts`
- Automation and communication: reminders, SMS, voice call, OCR, Tally import, TTS

Security model:
- Session checks in route handlers using `auth()` from `lib/auth.ts`.
- `middleware.ts` matcher protects `/dashboard/:path*` entry routes.
- Cron endpoint supports bearer/header secret validation via `CRON_SECRET` or `REMINDER_CRON_SECRET`.

## 5. Data Layer
Prisma schema is defined in `prisma/schema.prisma`.

Primary entities:
- Identity: `User`, `Account`, `Session`, `VerificationToken`, `Authenticator`
- Billing: `Invoice`, `InvoiceItem`, `Payment`
- CRM: `Customer`, `Product`, `CompanySettings`
- Reminder tracking: `InvoiceReminderLog`

Important data design details:
- `Invoice` includes owner and reminder settings (`ownerUserId`, `autoReminderEnabled`, `reminderOffsets`, `reminderChannel`).
- Multiple indexes already exist for date/status/due date and owner-based filtering.
- Dashboard stats endpoint uses both Prisma aggregate/groupBy and raw SQL for bucketing analytics.

## 6. Reminder and Notification Architecture
Reminder orchestration:
- Core reminder logic: `lib/reminders.ts`
- Sender/orchestration service: `lib/mail-service.ts`
- Auto-run endpoint: `app/api/reminders/auto/route.ts`
- Delivery channels: Email (Gmail), SMS (Twilio), Telegram mirror notification, Voice calls

Execution modes:
- Cloud mode: `vercel.json` cron triggers `/api/reminders/auto` daily at 09:00.
- Local mode: Windows task scheduler runs `scripts/automation/run-reminders.bat` -> `scripts/automation/run-reminders.js`.

Idempotency and safety:
- `InvoiceReminderLog` unique key (`invoiceId`, `reminderKey`) prevents duplicate sends.
- Paid invoices and invalid channel data are skipped.

## 7. Runtime/Deployment View
- Framework runtime: Next.js (Node runtime for route handlers).
- DB: PostgreSQL via `DATABASE_URL`.
- Deploy target: Vercel supported through `vercel.json` cron config.
- Local operations: PowerShell + Node scripts for reminder automation and logs in `logs/reminder-cron.log`.

## 8. Data Flow Examples
### 8.1 Dashboard Load
1. Browser opens `app/dashboard/page.tsx`.
2. Client requests `/api/dashboard/stats?revenueRange=month`.
3. API authenticates user (`auth()`), runs Prisma + SQL aggregations.
4. JSON response returns KPI, revenue series, status distribution, risk list.
5. React components render charts and tables.

### 8.2 Auto Reminder Run
1. Cron (Vercel or local script) calls `/api/reminders/auto` with secret.
2. API selects eligible invoices (unpaid + auto reminders enabled).
3. Reminder engine computes if reminder should fire for current date.
4. Mail/SMS/other channel senders dispatch notifications.
5. Reminder log row is inserted to prevent duplicate trigger.

## 9. Performance Optimization Plan (No Separate Backend Required)
Use this order before introducing a new backend service:

1. Move high-traffic dashboard reads to server components where possible.
2. Add route-level caching and revalidation policy per endpoint (dashboard stats already has short private cache headers).
3. Introduce pagination and server-side filtering for large invoice lists.
4. Use selective fields in `select` and avoid over-fetching in list endpoints.
5. Add Redis/Upstash cache for expensive aggregates if data volume grows.
6. Keep DB indexes aligned with real query patterns (`userId`, `status`, `dueDate`, date ranges).
7. Use background jobs/queues for heavy integrations (OCR, bulk imports, voice calls) instead of request-time execution.
8. Add API response compression and validate payload sizes for charts/lists.
9. Add monitoring on p95 API latency and slow queries.

## 10. When to Split to a Separate Backend
Consider a separate backend only if one or more conditions are true:
- You need independent scaling from frontend runtime.
- You need long-running worker infrastructure not suited to route handlers.
- You need multi-client API platform (mobile app + partner APIs) with strict versioning and gateway controls.
- Your p95 latency remains high after caching/index/query optimization.

For current architecture and scope, continue with integrated Next.js backend and optimize data access paths.

## 11. Key Files Reference
- Frontend shell: `app/layout.tsx`
- Dashboard UI: `app/dashboard/page.tsx`
- Invoices UI: `app/dashboard/invoices/page.tsx`
- Auth config: `lib/auth.ts`
- Prisma client: `lib/db.ts`
- Prisma schema: `prisma/schema.prisma`
- Dashboard API: `app/api/dashboard/stats/route.ts`
- Invoices API: `app/api/invoices/route.ts`
- Auto reminders API: `app/api/reminders/auto/route.ts`
- Reminder sender service: `lib/mail-service.ts`
- Deployment cron: `vercel.json`
- Local cron scripts: `scripts/automation/run-reminders.js`, `scripts/automation/run-reminders.bat`

## 12. Diagram Companion Description
This repository maintains two architecture documents for different use cases:

- `Documentation/architecture/system-architecture.md`: complete narrative architecture, components, decisions, and optimization guidance.
- `Documentation/architecture/system-architecture-diagrams.md`: visual diagrams with short descriptions for context, containers, and request flows.

Use them together: start with diagrams for quick understanding, then use this document for implementation-level detail.

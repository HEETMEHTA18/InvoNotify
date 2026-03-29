# System Architecture Diagrams

## 1. System Context
Description: This context diagram shows external actors and services around the core app. It highlights who uses the system, where backend APIs sit, and which third-party providers are integrated.

```mermaid
flowchart LR
    USER[Business User\nAdmin / Staff] --> WEB[Invoice Management Web App\nNext.js Frontend]

    WEB --> API[Next.js Backend APIs\napp/api/**]
    API --> DB[(PostgreSQL)]

    API --> GOOGLE[Google OAuth / Gmail API]
    API --> TWILIO[Twilio SMS]
    API --> Gmail[Gmail API/Email]
    API --> TELEGRAM[Telegram Bot API]
    API --> OCR[OCR Service]

    CRON[Vercel Cron / Windows Task Scheduler] --> AUTO[/api/reminders/auto]
```

## 2. Container Diagram
Description: This container-level diagram breaks the app into runtime building blocks. It shows how browser UI, Next.js pages/routes, domain services, integrations, and the database connect.

```mermaid
flowchart TB
    subgraph Browser[Client Browser]
        UI[React Client Components\nDashboard / Invoices / Settings]
    end

    subgraph NextApp[Next.js Application]
        Pages[App Router Pages\napp/**/page.tsx]
        Routes[Route Handlers\napp/api/**/route.ts]
        Auth[Auth Module\nlib/auth.ts]
        Services[Domain Services\nlib/mail-service.ts, lib/reminders.ts]
        Integrations[Integration Modules\nlib/sms.ts, lib/voice-call.ts, lib/telegram.ts, lib/gmail.ts]
        ORM[Prisma Client\nlib/db.ts]
    end

    subgraph Data[Data Tier]
        PG[(PostgreSQL)]
    end

    UI --> Pages
    Pages --> Routes
    Routes --> Auth
    Routes --> Services
    Services --> Integrations
    Routes --> ORM
    ORM --> PG
```

## 3. Invoice List Request Flow
Description: This sequence diagram explains the read path for invoice listing. It covers browser fetch, API auth validation, Prisma query execution, and JSON response rendering.

```mermaid
sequenceDiagram
    autonumber
    participant U as User Browser
    participant P as Dashboard Invoices Page
    participant A as /api/invoices
    participant AU as NextAuth (auth())
    participant PR as Prisma Client
    participant DB as PostgreSQL

    U->>P: Open Invoices page
    P->>A: GET /api/invoices?withItems=false
    A->>AU: Validate session
    AU-->>A: userId
    A->>PR: invoice.findMany(where: userId)
    PR->>DB: SQL query
    DB-->>PR: invoice rows
    PR-->>A: mapped records
    A-->>P: JSON response
    P-->>U: Render invoice list + stats
```

## 4. Automated Reminder Flow
Description: This sequence diagram captures the scheduled reminder pipeline. It includes cron trigger, authorization, invoice eligibility checks, channel dispatch, and idempotent logging.

```mermaid
sequenceDiagram
    autonumber
    participant C as Cron (Vercel/Local Script)
    participant R as /api/reminders/auto
    participant PR as Prisma Client
    participant DB as PostgreSQL
    participant S as Reminder Service
    participant E as Email/SMS/Voice Providers

    C->>R: POST /api/reminders/auto (secret)
    R->>R: Authorize cron secret
    R->>PR: find eligible unpaid invoices
    PR->>DB: Query invoices + customer flags
    DB-->>PR: due invoices

    loop each eligible invoice
        R->>S: getReminderMatchForDate + sendInvoiceReminderById
        S->>E: Send via configured channel(s)
        E-->>S: delivery result
        alt sent successfully
            R->>PR: create InvoiceReminderLog
            PR->>DB: INSERT reminder log
        else failed/skipped
            R->>R: count failure/skip
        end
    end

    R-->>C: summary JSON (sent/skipped/failed)
```

## 5. Dashboard Analytics Flow
Description: This sequence diagram shows how dashboard KPIs and charts are assembled. It maps the request from UI to analytics endpoint, aggregate queries, and final payload delivery.

```mermaid
sequenceDiagram
    autonumber
    participant U as User Browser
    participant D as Dashboard Page
    participant S as /api/dashboard/stats
    participant PR as Prisma + Raw SQL
    participant DB as PostgreSQL

    U->>D: Open dashboard
    D->>S: GET /api/dashboard/stats?revenueRange=month
    S->>PR: aggregate/groupBy/queryRaw for KPI + trends
    PR->>DB: SQL aggregates and grouped reads
    DB-->>PR: result sets
    PR-->>S: normalized metrics
    S-->>D: JSON (kpi, statusDistribution, monthlyRevenue, risk)
    D-->>U: Render charts and tables
```

## 6. Authentication and Authorization Flow
Description: This sequence diagram shows login and protected API access. It includes NextAuth session creation and route-level authorization checks before data queries.

```mermaid
sequenceDiagram
    autonumber
    participant U as User Browser
    participant L as Login/Register UI
    participant N as NextAuth API
    participant P as Provider/DB Check
    participant S as Session/JWT
    participant A as Protected API Route
    participant DB as PostgreSQL

    U->>L: Submit credentials or OAuth sign-in
    L->>N: POST /api/auth/[...nextauth]
    N->>P: Validate with Google or Credentials
    P-->>N: User verified
    N->>S: Create session token (JWT)
    S-->>U: Session cookie/token returned

    U->>A: Request protected endpoint
    A->>N: auth() session check
    alt authorized
        N-->>A: userId
        A->>DB: Query only user data
        DB-->>A: records
        A-->>U: 200 + JSON
    else unauthorized
        N-->>A: no valid session
        A-->>U: 401 Unauthorized
    end
```

## 7. Deployment and Scheduling Flow
Description: This runtime diagram explains how app hosting and reminder scheduling work in cloud and local modes, including secret-protected cron triggering.

```mermaid
flowchart LR
    subgraph Cloud[Cloud Runtime]
        V[Vercel Deployment]
        VC[Vercel Cron\n0 9 * * *]
        AR[/api/reminders/auto]
    end

    subgraph Local[Local Runtime]
        TS[Windows Task Scheduler]
        BAT[scripts/automation/run-reminders.bat]
        JS[scripts/automation/run-reminders.js]
        ARL[/api/reminders/auto]
    end

    DB[(PostgreSQL)]
    CH[Email/SMS/Voice Channels]

    VC --> AR
    TS --> BAT --> JS --> ARL
    AR --> DB
    ARL --> DB
    AR --> CH
    ARL --> CH
```

## Notes
- This project already includes backend capabilities inside Next.js Route Handlers.
- For speed improvements, optimize query patterns, caching, payload size, and server rendering strategy before introducing a separate backend service.

## Document Usage
- Use `Documentation/architecture/system-architecture.md` for full written architecture, decisions, and optimization plan.
- Use `Documentation/architecture/system-architecture-diagrams.md` for visual communication in reviews, presentations, and onboarding.

# InvoNotify AI — System Architecture

> **Razorpay Buildathon 2026 — Autonomous Revenue Recovery Agent**

---

## 1. Vision

InvoNotify is an **Autonomous Revenue Recovery Agent** that predicts which invoices are at risk, chooses optimal recovery strategies, executes bounded actions through Razorpay, and learns from payment outcomes.

```
                    ┌─────────────────────────┐
                    │     Merchant Dashboard   │
                    │   (Revenue Command Ctr)  │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    InvoNotify Backend    │
                    │   (Next.js 16 + Prisma) │
                    └────────────┬────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
     ┌────────▼────────┐ ┌──────▼──────┐ ┌────────▼────────┐
     │  Razorpay APIs  │ │  AI Layer   │ │  Event System   │
     │  Payment Links  │ │  ML + LLM   │ │  Bus + Workflows│
     │  Webhooks       │ │  Agent      │ │                 │
     └────────┬────────┘ └──────┬──────┘ └────────┬────────┘
              │                  │                  │
              └──────────────────┼──────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Policy Engine (Guard)  │
                    │  Bounded & Gated Actions │
                    └────────────┬────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
     ┌────────▼────────┐ ┌──────▼──────┐ ┌────────▼────────┐
     │  Action Engine   │ │  PostgreSQL │ │  Audit Trail    │
     │  Email/SMS/PL    │ │  (Neon)     │ │  Every Decision │
     └─────────────────┘ └─────────────┘ └─────────────────┘
```

---

## 2. Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4 | Merchant dashboard, invoice management |
| UI Library | Shadcn/ui (Radix UI), Recharts, Framer Motion | Charts, animations, accessible components |
| Backend | Next.js API Routes (server-side) | All business logic, no separate server |
| Database | PostgreSQL (Neon) via Prisma 5 | 17 models, connection pooling |
| Auth | NextAuth.js 5 (Auth.js v5) | Google OAuth + Credentials |
| Email | Gmail API (googleapis) | HTML templates, PDF attachments |
| Payments | Razorpay (Test Mode) + Stripe | Payment links, webhooks, checkout |
| AI/ML | Logistic Regression (custom) | Payment risk scoring |
| LLM | LLM Provider API | Recovery decision generation |
| OCR | Sarvam AI + OCR.space fallback | Invoice image processing |
| Voice | VAPI.ai | Voice call reminders (configured) |
| Storage | Cloudinary | Logo, signature image storage |
| PDF | jsPDF + jspdf-autotable | Invoice PDF generation |

---

## 3. Directory Structure

```
Invonotify/
├── app/                              # Next.js App Router
│   ├── api/                          # API routes (30+ endpoints)
│   │   ├── ai/                       # AI recovery endpoints
│   │   │   ├── health/               # Health check
│   │   │   ├── metrics/              # AI metrics dashboard
│   │   │   └── recovery/             # Recovery cases + sweep
│   │   ├── auth/                     # NextAuth handler
│   │   ├── customers/                # Customer CRUD + bulk import
│   │   ├── dashboard/                # Dashboard stats
│   │   ├── invoices/                 # Invoice CRUD + send + reminders
│   │   ├── ocr/                      # OCR invoice processing
│   │   ├── payments/                 # Manual payment recording
│   │   ├── products/                 # Product catalog
│   │   ├── razorpay/                 # Razorpay payment links
│   │   ├── reminders/                # Auto + manual reminders
│   │   ├── settings/                 # Company settings + QR
│   │   ├── stripe/                   # Stripe checkout + webhooks
│   │   ├── tally-import/             # Tally XML import
│   │   ├── upload/                   # Cloudinary image upload
│   │   └── webhooks/razorpay/        # Razorpay webhook handler
│   ├── dashboard/                    # Dashboard pages (auth-gated)
│   ├── landing/                      # Landing page
│   ├── login/                        # Login (credentials + Google)
│   └── register/                     # Registration
├── components/
│   ├── recovery/                     # Recovery UI components
│   │   ├── RecoveryOverview.tsx      # Dashboard summary cards
│   │   ├── RecoveryCaseList.tsx      # Case list table
│   │   └── RecoveryCaseDetail.tsx    # Audit trail dialog
│   ├── dashboard/                    # Sidebar, stats, charts
│   ├── customers/                    # CIBIL meter
│   ├── landing/                      # Full landing page
│   └── ui/                           # Shadcn-style primitives
├── lib/
│   ├── ai/                           # AI recovery system
│   │   ├── orchestrator.ts           # Central recovery loop
│   │   ├── context.ts                # Recovery context builder
│   │   ├── config.ts                 # Env validation (Zod)
│   │   ├── logger.ts                 # Structured logger
│   │   ├── rate-limit.ts             # In-memory rate limiter
│   │   ├── agent/                    # LLM decision agent
│   │   │   ├── decision-agent.ts     # Decision entrypoint
│   │   │   ├── llm-provider.ts       # LLM API client
│   │   │   └── types.ts              # Agent type definitions
│   │   ├── ml/                       # Machine learning
│   │   │   ├── risk-model.ts         # Logistic regression scorer
│   │   │   ├── features.ts           # Feature normalization
│   │   │   ├── model-weights.json    # Trained weights
│   │   │   └── types.ts              # ML type definitions
│   │   ├── policy/                   # Safety layer
│   │   │   └── engine.ts             # Policy engine
│   │   └── actions/                  # Action executor
│   │       └── engine.ts             # Action engine
│   ├── events/                       # Event system
│   │   ├── types.ts                  # Event type definitions
│   │   ├── bus.ts                    # In-memory event bus
│   │   ├── index.ts                  # Barrel exports
│   │   └── workflows/
│   │       └── recovery.ts           # Recovery event handlers
│   ├── razorpay.ts                   # Razorpay API client
│   ├── stripe.ts                     # Stripe API client
│   ├── auth.ts                       # NextAuth configuration
│   ├── db.ts                         # Prisma client singleton
│   ├── hooks.ts                      # Auth helpers (requireUser)
│   ├── mail-service.ts               # Email sending
│   ├── gmail.ts                      # Gmail API integration
│   ├── templates.ts                  # Email HTML templates
│   ├── reminders.ts                  # Reminder scheduling
│   ├── customer-credit.ts            # CIBIL-like credit scoring
│   ├── pdf.ts                        # Invoice PDF generation
│   ├── sms.ts                        # SMS (Twilio stub)
│   ├── telegram.ts                   # Telegram notifications
│   └── utils.ts                      # Utility functions
├── prisma/
│   ├── schema.prisma                 # Database schema (17 models)
│   └── migrations/                   # 12 migrations
├── scripts/ai/                       # AI scripts
│   ├── seed-recovery-data.ts         # Demo data seeder
│   ├── seed-production.ts            # Production-safe seeder
│   ├── run-ai-tests.ts              # AI unit tests
│   └── simulate-failures.ts         # QA failure simulation
├── docs/                             # Documentation
└── Documentation/                    # SRS, architecture, specs
```

---

## 4. Data Flow — Complete Revenue Recovery Loop

```
Merchant creates invoice
        │
        ▼
Invoice stored in DB (status: Pending)
        │
        ▼
Due date passes → Invoice overdue
        │
        ▼
Event Bus: invoice.overdue
        │
        ▼
Recovery Workflow triggered
        │
        ▼
┌─────────────────────────────────────┐
│  buildRecoveryContext(invoiceId)    │
│  ├─ Load invoice + customer data   │
│  ├─ Calculate customer history     │
│  ├─ Extract ML features            │
│  └─ scoreRisk(features)            │
│     → riskScore, paymentProbability│
│     → expectedRecovery             │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  decideRecoveryAction(context)      │
│  ├─ LLM receives structured JSON   │
│  ├─ Returns recommended action     │
│  ├─ channel, urgency, reason       │
│  └─ confidence score               │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  evaluatePolicy(context, decision)  │
│  ├─ Hard blocks (paid, disputed)   │
│  ├─ Money action limits (₹50K)    │
│  ├─ Notification limits (₹1L)     │
│  ├─ High-risk → human approval     │
│  └─ Returns: ALLOW / BLOCK / APPROVE│
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  executeAction(context, decision)   │
│  ├─ SEND_REMINDER → Email/SMS     │
│  ├─ CREATE_PAYMENT_LINK → Razorpay │
│  ├─ RESEND_PAYMENT_LINK → Razorpay │
│  ├─ ESCALATE_TO_HUMAN → Dashboard  │
│  ├─ SCHEDULE_FOLLOWUP → Scheduler  │
│  └─ STOP → No-op                   │
│                                     │
│  Fallback: Primary fails → SMS     │
│  Last resort: Escalate to human    │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  Audit Trail (AgentAction table)   │
│  ├─ Every decision logged          │
│  ├─ Why? What? Action? Result?     │
│  ├─ Model version, confidence      │
│  └─ Policy reasons, fallback used  │
└─────────────────────────────────────┘
              │
              ▼
Customer receives notification/payment link
              │
              ▼
Customer pays via Razorpay
              │
              ▼
Razorpay webhook → /api/webhooks/razorpay
              │
              ▼
Payment recorded → Invoice updated → Recovery case closed
              │
              ▼
Dashboard shows: Revenue recovered ✓
```

---

## 5. Security Model

### Authentication
- NextAuth.js 5 with Google OAuth + Credentials
- JWT session strategy
- Server-side: `requireUser()` / `auth()` helpers

### Authorization
- All data scoped to `ownerUserId` / `userId`
- Multi-tenant isolation enforced at query level
- Invoice operations verify ownership before modification

### Payment Safety
- **Policy Engine** gates all money actions (pure function, no DB/clock — injected `now`)
- Invoices > ₹50,000 require human approval; > ₹1,00,000 even for a reminder
- High-risk customers require human approval
- Disputed invoices: all automation blocked
- Opted-out customers: **every** customer-contact action blocked, including
  payment links (a Razorpay link emails the customer) — and not overridable by
  merchant approval, because it is a compliance rule rather than an autonomy bound

### Autonomy Bounds (stopping rules)
- Max 4 automatic contact attempts per case, then hand off to a human
- 48h cooldown between two contacts on the same case
- ₹200 cost-to-recover floor — one free attempt, then stop
- Max 5 escalations per rolling 24h per case (protects the review queue)

All four are defined in `POLICY_LIMITS` (`lib/ai/policy/engine.ts`) and computed
from the `AgentAction` audit trail, so the bounds and the log cannot drift apart.
See `docs/AI_RECOVERY_SYSTEM.md` §5 for the full rule order.

### Webhook Security
- Razorpay: HMAC-SHA256 signature verification
- Stripe: HMAC-SHA256 signature verification
- Idempotent event processing via `eventId` uniqueness

### Rate Limiting
- Recovery sweep: 5 requests/minute
- Recovery action approval: 10 requests/minute
- In-memory rate limiter with sliding window

---

## 6. Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection (Neon pooler) |
| `DIRECT_URL` | Yes | PostgreSQL direct connection (migrations) |
| `NEXTAUTH_SECRET` | Yes | NextAuth JWT secret |
| `AUTH_SECRET` | Yes | Auth.js secret |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `RAZORPAY_KEY_ID` | Optional | Razorpay **Test Mode** key ID for the separately authorized payment extension |
| `RAZORPAY_KEY_SECRET` | Optional | Razorpay **Test Mode** key secret (server only) |
| `RAZORPAY_WEBHOOK_SECRET` | Optional | Razorpay **Test Mode** webhook signature secret |
| `STRIPE_SECRET_KEY` | Optional | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Optional | Stripe webhook secret |
| `OCR_SPACE_API_KEY` | Optional | OCR fallback API key |
| `CLOUDINARY_*` | Optional | Image storage |
| `VAPI_*` | Optional | Voice call agent |
| `TELEGRAM_*` | Optional | Telegram notifications |
| `LLAMAINDEX_API_KEY` | Optional | LLM provider API |

---

## 7. Deployment

- **Platform:** Vercel (serverless)
- **Database:** Neon PostgreSQL (serverless, connection pooling)
- **Domain:** https://invonotify.vercel.app
- **CI:** GitHub Actions (lint, type check)
- **Cron:** Daily reminder sweep (GitHub Actions → `/api/reminders/auto`)

---

## 8. Buildathon Track

**Track:** AI Revenue Recovery — Autonomous Revenue Recovery Agent

**Key Differentiators:**
1. ML-based payment risk prediction (not just rule-based)
2. LLM-powered recovery strategy selection
3. Policy engine with bounded/gated money actions
4. Full audit trail with explainability
5. Graceful failure handling with fallbacks
6. Razorpay integration (payment links, webhooks)
7. Measurable business metrics (recovery rate, DSO reduction)

**Demo Flow:**
1. Merchant opens the seeded local overdue portfolio
2. AI scores each invoice for risk
3. Agent chooses different strategies per customer
4. **Run Safe Demo** persists simulated actions and audit evidence with no
   customer or provider call
5. Optional extension: a separately configured Razorpay Test Mode merchant
   completes a controlled test payment
6. Dashboard distinguishes forecast, seeded illustrative recovery, and a
   confirmed webhook settlement

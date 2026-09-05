# InvoNotify — AI-Powered Invoice Revenue Recovery

> **[Architecture & System Design →](proposed.md)**

An AI-powered invoice recovery platform that automatically detects overdue invoices, assesses risk using machine learning, and executes multi-channel recovery actions via Razorpay payment links.

**Live Demo:** [invonotify.vercel.app](https://invonotify.vercel.app)

---

## Table of Contents

1. [Overview](#overview)
2. [Key Features](#key-features)
3. [Quick Start](#quick-start)
4. [Architecture](#architecture)
5. [Tech Stack](#tech-stack)
6. [Environment Variables](#environment-variables)
7. [Demo Setup](#demo-setup)
8. [AI Recovery System](#ai-recovery-system)
9. [Dashboard Pages](#dashboard-pages)
10. [API Reference](#api-reference)
11. [Razorpay Integration](#razorpay-integration)
12. [Testing](#testing)
13. [Deployment](#deployment)
14. [License](#license)

---

## Overview

InvoNotify solves the ₹50,000 crore problem of unpaid B2B invoices. Instead of manual collection teams chasing payments, an AI agent autonomously:

1. **Detects** overdue invoices
2. **Scores** risk using ML (11 features)
3. **Decides** the best action and channel
4. **Executes** via email, WhatsApp, or Razorpay payment links
5. **Learns** from outcomes to improve

**Demo Credentials:**
- Email: `razorpay@invo-notify.test`
- Password: `razorpay`

---

## Key Features

### AI Recovery Engine
- ML risk scoring with 11 weighted features
- LLM-powered decision agent (GPT-4o-mini)
- 9 policy guardrails (no harassment, opt-outs, business hours)
- Explainable decisions with feature contributions

### Multi-Channel Notifications
- **Email** — Gmail SMTP with branded templates
- **WhatsApp** — Meta Cloud API (free within 24h window)
- **Razorpay Payment Links** — One-click checkout

### Customer Intelligence
- CIBIL credit score integration
- Payment history analysis
- Promise-to-pay tracking
- Automated reminder scheduling

### Dashboard & Analytics
- Real-time recovery funnel
- Baseline vs AI comparison (85% vs 18%)
- Strategy effectiveness tracking
- Full audit trail

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/HEETMEHTA18/InvoNotify.git
cd InvoNotify
pnpm install

# Setup database
npx prisma generate
npx prisma migrate deploy

# Seed demo data
pnpm ai:seed

# Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and login with `razorpay` / `razorpay`.

---

## Architecture

See **[proposed.md](proposed.md)** for full architecture diagrams and system design.

### High-Level Flow

```
Overdue Invoice → ML Risk Scoring → Decision Agent → Policy Engine → Execute Action
                                                                     ↓
                                              ┌──────────────────────┤
                                              ↓                      ↓
                                           Email              WhatsApp
                                              ↓                      ↓
                                         Payment Link ←──────────────┘
                                              ↓
                                         Razorpay Checkout
                                              ↓
                                         Webhook → Case Closed
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, Tailwind CSS |
| Backend | Next.js API Routes |
| Database | PostgreSQL (Neon) + Prisma ORM |
| Auth | NextAuth v5 |
| Payments | Razorpay Test Mode |
| Email | Gmail SMTP (nodemailer) |
| WhatsApp | Meta Cloud API |
| ML | Logistic Regression (custom) |
| LLM | GPT-4o-mini |
| Hosting | Vercel |

---

## Environment Variables

Create `.env` in repository root:

### Required
```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
AUTH_SECRET="your-secret"
NEXTAUTH_SECRET="your-secret"
```

### Razorpay
```env
RAZORPAY_KEY_ID="rzp_test_..."
RAZORPAY_KEY_SECRET="..."
RAZORPAY_WEBHOOK_SECRET="..."
```

### Email
```env
GMAIL_USER="your-email@gmail.com"
GMAIL_APP_PASSWORD="your-app-password"
```

### AI (Optional - uses fallback if not set)
```env
OPENAI_API_KEY="sk-..."
```

### Cron
```env
CRON_SECRET="long-random-secret"
```

---

## Demo Setup

### Seed Demo Data

```bash
# Reset and seed 9 customers, 15 invoices
pnpm ai:seed

# Run AI sweep (safe demo mode)
curl -X POST http://localhost:3000/api/ai/recovery \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'
```

### Demo Dataset

| Customer | CIBIL | Risk | Demonstrates |
|----------|-------|------|--------------|
| Acme Traders | 720 | LOW | Gentle reminder |
| Beta Industries | 580 | HIGH | Human approval required |
| Gamma Retail | 810 | LOW | Excellent payer |
| Delta Logistics | 620 | HIGH | Chronic late payer |
| Epsilon Foods | 700 | MEDIUM | Payment link |
| Zeta Pharma | 690 | BLOCKED | Opted out |
| Omega Constructions | 750 | VIP | Human handled |
| Kappa Textiles | 660 | STOP | Below cost floor |
| Sigma Electronics | 540 | CRITICAL | Escalate immediately |

---

## AI Recovery System

### ML Risk Model

11 features scored via logistic regression:

```typescript
{
  amountDue,           // 0.15 weight
  daysOverdue,         // 0.20 weight
  customerAgeDays,     // 0.05 weight
  previousInvoiceCount,// 0.08 weight
  previousLatePayments,// 0.18 weight
  averagePaymentDelayDays, // 0.12 weight
  paymentSuccessRate,  // 0.10 weight
  previousReminders,   // 0.05 weight
  isVipExempt,         // 0.02 weight
  cibilScore,          // 0.03 weight
  humanEngaged         // 0.02 weight
}
```

### Risk Levels

| Score | Level | Action |
|-------|-------|--------|
| ≥ 0.85 | CRITICAL | Escalate to human |
| ≥ 0.70 | HIGH | Aggressive follow-up |
| ≥ 0.40 | MEDIUM | Payment link + reminders |
| < 0.40 | LOW | Gentle nudge |

### Policy Guardrails

9 guardrails prevent:
- Contacting opted-out customers
- Harassment (frequency caps)
- Contacting outside business hours
- Auto-sending large amounts (requires approval)
- Chasing invoices below cost floor

---

## Dashboard Pages

| Route | Description |
|-------|-------------|
| `/dashboard` | Main KPIs and metrics |
| `/dashboard/invoices` | Invoice list + create |
| `/dashboard/recovery` | AI recovery war room |
| `/dashboard/recovery/analytics` | Funnel + baseline comparison |
| `/dashboard/diagnosis` | ML failure classification |
| `/dashboard/credit-scores` | CIBIL score dashboard |
| `/dashboard/promises` | Promise-to-pay tracking |
| `/dashboard/whatsapp` | WhatsApp channel config |
| `/dashboard/customers` | Customer management |
| `/dashboard/settings` | Merchant settings |

---

## API Reference

### Core Endpoints
- `POST /api/invoices` — Create invoice
- `GET /api/invoices` — List invoices
- `POST /api/payments` — Record payment
- `POST /api/invoices/[id]/send` — Send invoice email

### AI Recovery
- `GET /api/ai/recovery` — List recovery cases
- `POST /api/ai/recovery` — Run AI sweep
- `POST /api/ai/recovery/[id]/approve` — Approve action

### v1 API
- `POST /api/v1/recovery-cases/[id]/diagnose` — ML diagnosis
- `POST /api/v1/recovery-cases/[id]/score` — Risk scoring
- `POST /api/v1/recovery-cases/[id]/promises` — Create promise
- `POST /api/v1/promises/reminders` — Process reminders
- `POST /api/v1/credit-score` — Fetch credit scores

### Webhooks
- `GET/POST /api/webhooks/razorpay` — Razorpay payment events

---

## Razorpay Integration

### Payment Link Flow

1. AI creates payment link via `POST /payment_links`
2. Link URL included in email + WhatsApp
3. Customer clicks → Razorpay checkout
4. Payment succeeds → Webhook fires
5. Invoice marked as paid → Case closed

### Webhook Handling

```typescript
// GET handler (callback_method: "get")
GET /api/webhooks/razorpay?razorpay_payment_id=...&razorpay_payment_link_status=paid

// POST handler (webhook events)
POST /api/webhooks/razorpay
```

---

## Testing

```bash
# AI unit tests (15 tests)
pnpm ai:unit

# Full test suite (42 tests)
npx tsx --test tests/ai/agent/decision-agent.test.ts tests/ai/policy/engine.test.ts

# TypeScript check
npx tsc --noEmit
```

---

## Deployment

### Vercel

```bash
# Push to GitHub
git push origin main

# Vercel auto-deploys from main branch
```

### Environment Variables (Vercel)

Set in Vercel Dashboard → Settings → Environment Variables:
- `DATABASE_URL`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `GMAIL_USER`
- `GMAIL_APP_PASSWORD`
- `CRON_SECRET`

### GitHub Actions

- **CI:** Runs tests on every push
- **Recovery Sweep:** Cron job every 6 hours

---

## Project Structure

```
app/                    Next.js pages and API routes
├── dashboard/          Dashboard pages
│   ├── credit-scores/  CIBIL score dashboard
│   ├── diagnosis/      ML failure diagnosis
│   ├── invoices/       Invoice management
│   ├── promises/       Promise-to-pay
│   ├── recovery/       AI recovery + analytics
│   └── whatsapp/       WhatsApp channel
├── invoice/            Public invoice pages
└── api/                Backend API routes
    ├── ai/             AI recovery endpoints
    ├── v1/             v1 API endpoints
    └── webhooks/       Webhook handlers

lib/                    Shared utilities
├── ai/                 AI engine (ML, decisions, policies)
├── razorpay.ts         Razorpay integration
├── whatsapp.ts         WhatsApp Cloud API
├── credit-bureau.ts    Credit score fetching
└── mail-service.ts     Email + WhatsApp delivery

components/             React components
├── customers/          CIBIL meter gauge
├── recovery/           Recovery case components
└── ui/                 Base UI primitives
```

---

## Documentation

- **[Architecture & System Design →](proposed.md)**
- [PRD.md](PRD.md) — Product requirements
- [DEMO_SCRIPT.md](DEMO_SCRIPT.md) — 5-minute demo script
- [DEMO_VIDEO_PIPELINE.md](DEMO_VIDEO_PIPELINE.md) — Video creation guide

---

## License

Developed for Razorpay Hackathon. All rights reserved.

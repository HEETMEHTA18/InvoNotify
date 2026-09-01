# Implementation Plan — InvoNotify AI: Autonomous Revenue Recovery Agent

> **Historical planning snapshot.** This Phase 0 roadmap predates the current
> implementation; use [`PRD.md`](../PRD.md), [`README.md`](../README.md), and
> [`docs/RAZORPAY_HACKATHON_TODO.md`](RAZORPAY_HACKATHON_TODO.md) for current
> operating guidance.
>
> Target: **AI Revenue Recovery** — predict which invoices are at risk, choose the
> optimal recovery strategy, execute bounded actions through Razorpay, learn from
> payment outcomes, and expose everything in an explainable audit trail.

## Guiding principles

1. **Webhooks, not polling.** Razorpay event flow must drive the system
   (`payment_link.paid`, `payment_link.partially_paid`, `payment_link.expired`,
   `payment_link.cancelled`, `payment.failed`).
2. **ML before LLM.** Risk scoring is deterministic-ish ML first; LLM only
   recommends a strategy from structured inputs.
3. **The LLM never touches money directly.** LLM → structured decision → Policy
   Engine → Action Engine → Razorpay. Gate + audit every action.
4. **Idempotent & secure by default.** Persist webhook events with `UNIQUE(eventId)`;
   verify signatures; fail closed.
5. **Append-only schema changes.** Never break existing routes/legacy fallbacks.
6. **Explainable.** Every agent action records why/what/expected-result/outcome.

## Suggested sequence (phased, dependency-ordered)

```
PHASE 0  Repository analysis (DONE — this doc set)
PHASE 1  Domain models + migration + seed
PHASE 2  Razorpay integration (Test mode) + Payment Link
PHASE 3  Webhook ingestion + event system + idempotency
PHASE 4  Recovery orchestrator (rule-based MVP end-to-end loop)
PHASE 5  ML risk engine
PHASE 6  LLM decision agent
PHASE 7  Policy engine (safety layer)
PHASE 8  Action engine (execute approved decisions)
PHASE 9  Merchant dashboard + explainability UI
PHASE 10 QA / failure simulation + metrics
PHASE 11 Demo script + pitch docs
PHASE 12 Bounded policy (stopping rules + opt-out) + measured recovery
```

Dependency graph:

```
DB (1) ──┬──> Razorpay (2) ──> Webhooks (3) ──> Orchestrator MVP (4)
         └──> ML (5) ──> LLM (6) ──> Policy (7) ──> Actions (8) ──> Dashboard (9)
                                                          │
                                              Orchestrator consumes (5,6,7,8)
```

## Phase 1 — Domain models (Agent: DB)

**Ownership:** `prisma/schema.prisma`, new migration under `prisma/migrations/`.

Add (append-only), per `DATABASE_MAP.md`:
`WebhookEvent` (`@@unique([eventId])`), `PaymentEvent`, `AgentRun`, `AgentAction`,
`RecoveryAttempt`; optional `PaymentLink`.

Relations:
- `WebhookEvent.eventId` unique — Razorpay `x-razorpay-event-id` (at-least-once dedup).
- `PaymentEvent.invoiceId → Invoice` (datasetId for ML).
- `AgentRun.userId → User`; `AgentAction.{agentRunId?, invoiceId, userId}`;
- `RecoveryAttempt.invoiceId → Invoice`.

**Acceptance:** `prisma migrate dev` succeeds; seed script inserts a small demo
merchant + customers + overdue invoices. `pnpm build` passes (prisma generate).

## Phase 2 — Razorpay integration, Test mode (Agent: Razorpay)

**Ownership:** `lib/razorpay.ts`, `app/api/razorpay/*`, no touching other files.

Build a minimal client mirroring `lib/stripe.ts` (fetch + Basic auth, no SDK):

- `createPaymentLink(invoice)` → Razorpay `/v1/payment_links` (amount in paise,
  currency INR, `customer`, `notes[invoiceId]`, `callback_url` → a customer page,
  `expire_by`).
- `fetchPaymentLink(id)`, `cancelPaymentLink(id)`, `resendPaymentLink(id)`.
- Test-mode keys via env `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`.

**Critical:** the Payment Link `callback_url` must point at a customer-facing page
that is NOT redirected by `next.config.ts`. Create `app/pay/[linkId]/page.tsx`
(or reuse a new public route) and update the `/invoice/:path*` redirect if needed.

**Acceptance:** manual curl/UI can create a Payment Link in test mode; a test
payment on the link is observable in the Razorpay dashboard.

## Phase 3 — Webhook ingestion (Agent: Events)

**Ownership:** `app/api/webhooks/razorpay/route.ts`, `lib/events/`, `lib/webhooks/`.

Flow:
```
Razorpay POST /api/webhooks/razorpay
  → verify signature (RAZORPAY_WEBHOOK_SECRET, x-razorpay-signature HMAC-SHA256)
  → read x-razorpay-event-id
  → upsert WebhookEvent (skip if already processed → 200)
  → dispatch by event type → update Invoice + create PaymentEvent
  → on payment_link.paid: apply payment (transaction), cancel pending recovery
```

**Acceptance:** send a test webhook → event persisted once (repeat → no dup),
invoice balance/status updated, `PaymentEvent` written.

## Phase 4 — Recovery orchestrator MVP (Agent: Orchestrator)

**Ownership:** `lib/recovery/`.

`RecoveryOrchestrator.run(userId?, options)`:
1. Query overdue/unpaid invoices (`balance > 0`, status Pending/Draft/Overdue).
2. For each: build context (invoice, customer, history) → decide action
   (Phase 4 = deterministic rules: overdue days → SEND_REMINDER / CREATE_PAYMENT_LINK /
   ESCALATE).
3. Run through policy (Phase 7 stub: allow small, human-review large).
4. Execute (Phase 8 stub: reuse `sendInvoiceReminderById`, `createPaymentLink`).
5. Log `AgentRun` + `AgentAction`, store outcome, wait for webhook to close.

Expose `POST /api/recovery/run` (auth) and `POST /api/recovery/run/all` (cron-secret)
returning a summary (scanned/decided/executed/blocked).

**Acceptance:** end-to-end on test data: overdue invoice → risk-less rule action →
payment link created → webhook pays it → invoice marked Paid → dashboard reflects it.

## Phase 5 — ML risk engine (Agent: ML)

**Ownership:** `ai/ml/` (Python) + `lib/risk/` (TS wrapper).

Features (per invoice + customer): invoice_amount, days_overdue, previous_invoice_count,
previous_late_payments, average_payment_delay, payment_success_rate, previous_reminders,
customer segment/CIBIL.

Output: `{ risk_score, payment_probability, model_version }`.

- Start Logistic Regression / Random Forest in Python (sklearn); export `.pkl`/`.onnx`.
- TS wrapper `lib/risk/predict.ts` loads model + feature builder from `Invoice`/`Customer`.
- Provide training/eval script (`train.py`, `evaluate.py`) with precision/recall/F1/ROC-AUC.

**Acceptance:** evaluation report on held-out test data; wrapper returns a score
for a sample invoice; scores persisted (or recomputable) for dashboard use.

## Phase 6 — LLM decision agent (Agent: AI)

**Ownership:** `ai/agent/`, `ai/prompts/`, `ai/tools/`.

Input: `{ invoice, customer, risk, history }` (structured, no raw money moves).
Output (JSON only): `{ recommended_action, channel, urgency, reason, confidence }`.

Allowed actions enum: `SEND_REMINDER | CREATE_PAYMENT_LINK | RESEND_PAYMENT_LINK |
SCHEDULE_FOLLOWUP | ESCALATE | STOP`. Nothing else.

**Acceptance:** prompt returns valid schema for fixture inputs; malformed JSON/
timeout handled with a safe default (`ESCALATE`), never a direct Razorpay call.

## Phase 7 — Policy engine (Agent: Policy) — most important

**Ownership:** `lib/policy/`.

Deterministic rules layer between decision and execution:
- invoice paid/disputed/opted-out → BLOCK
- amount > threshold (e.g. ₹50,000) → REQUIRE_HUMAN_APPROVAL
- action/channel not allowed for segment → BLOCK / downgrade channel
- auto-actions allowed within configured limits; everything else → HUMAN_REVIEW

Output: `{ verdict: ALLOW | BLOCK | HUMAN_REVIEW, reason, autoExecutable }`.
Expose a review queue API (`GET/POST /api/recovery/review`) for merchant approval.

**Acceptance:** unit tests covering ALLOW/BLOCK/HUMAN_REVIEW cases; no action
executes without a policy verdict.

## Phase 8 — Action engine (Agent: Actions)

**Ownership:** `lib/actions/`, `lib/notifications/`.

`ActionExecutor.execute({action, channel, invoice, context})` → one of:
`SEND_EMAIL`, `SEND_SMS` (via existing libs; SMS fails closed → fallback),
`CREATE_PAYMENT_LINK`, `RESEND_PAYMENT_LINK`, `SCHEDULE_FOLLOWUP`, `ESCALATE_TO_MERCHANT`.

Contract: **decision → policy → execute**. Never decision → Razorpay directly.
Every result recorded to `AgentAction.executionStatus` + `RecoveryAttempt`.

**Acceptance:** each action type runs against test mode and updates audit rows;
failure paths (provider down) produce `FAILED` + fallback attempt.

## Phase 9 — Dashboard + explainability (Agent: UI)

**Ownership:** `app/dashboard/recovery/*`, `components/dashboard/*`.

- Revenue command center: recovered amount, at-risk amount, recovery rate,
  AI actions pipeline, per-invoice recommended action.
- "Why did the AI do this?" panel per invoice (risk score, reason, policy verdict,
  execution steps, outcome) from `AgentAction`.
- "Run Safe Demo" button → `POST /api/ai/recovery` with `dryRun: true`; review queue for HUMAN_REVIEW.

**Acceptance:** merchant can run a recovery, see decisions + explanations, approve
escalations, and observe recovered vs at-risk totals.

## Phase 10 — QA / failure simulation (Agent: QA)

**Ownership:** `tests/` (+ Playwright).

Cases: payment success/failure/partial/duplicate; webhook invalid signature,
duplicate event, out-of-order, unknown type; LLM timeout/JSON error/low confidence;
provider failure (email/SMS); policy blocks (paid, disputed, large, opted-out).
Track ML + business metrics (precision/recall/F1; recovery rate, recovered amount).

**Acceptance:** a failure-simulation script that demonstrates at least one
fallback (e.g., SMS → email) end-to-end.

## Phase 11 — Demo + pitch (Agent: Demo)

**Ownership:** `docs/`.

Produce `docs/DEMO_SCRIPT.md`, `docs/JUDGING_POINTS.md`, `docs/METRICS.md`.
Demo narrative: ₹1L overdue portfolio → AI scores → different strategies per
customer → Razorpay test API executes → one action fails → agent falls back →
dashboard shows recovered vs remaining at risk.

## Phase 12 — Bounded policy + measured recovery (Agent: Policy/Eval) — DONE

**Why:** the judge rubric scores four things — *measured money recovered ·
compliant escalation · stopping rules · audit trail*. The audit trail existed;
the other three had gaps. Two were real defects, not missing features:

- `MAX_AUTO_ESCALATIONS_PER_DAY = 5` was declared in the policy engine and
  **never read**. There was no attempt cap, no cooldown, no cost floor — a
  "bounded autonomous agent" with no bound on how often it contacts a customer.
- Opt-out was only checked for *notification* actions, so `CREATE_PAYMENT_LINK`
  passed the gate and Razorpay emailed the customer via `notify.email`. And the
  only call site hardcoded `optedOut: false`, so the check was dead in production.
  There was also no opt-out column in the schema.

**Ownership:** `lib/ai/policy/engine.ts`, `lib/ai/context.ts`,
`lib/ai/orchestrator.ts`, `prisma/schema.prisma` (+ migration),
`scripts/ai/evaluate-recovery.ts`, `tests/ai/policy/`, `docs/`.

### 12a — Stopping rules + opt-out (policy engine)

Consolidate every threshold into one exported `POLICY_LIMITS` object (the
decision agent imports it instead of re-hardcoding `50000`), add
`CONTACT_ACTIONS` (the three actions that actually message the customer —
`SCHEDULE_FOLLOWUP` is internal), and add an optional `history?: ContactHistory`
input carrying `now` / `contactAttempts` / `lastContactAt` / `escalationsToday`.

`now` is **injected**, so `evaluatePolicy()` stays a pure function — no DB, no
clock, no IO. That is what keeps its tests database-free. `history` is optional
so every existing caller compiles and behaves as a first contact.

Four stopping rules, evaluated only for autonomous contact actions:

| Rule | Bound |
|---|---|
| Max contact attempts | 4, then hand off to a human |
| Cooldown | 48h minimum gap between contacts |
| Cost-to-recover floor | ₹200 — one free attempt, then stop |
| Escalation cap | 5 per rolling 24h per case |

Rule order is documented in the engine (first match wins): hard blocks →
STOP/ESCALATE → **opt-out (compliance)** → **stopping rules** → approval gates →
deny by default. Two deliberate asymmetries: manual approval *bypasses* the
stopping rules (autonomy bounds — a human took the decision) but *never*
bypasses opt-out (compliance).

### 12b — Opt-out wired end-to-end

`Customer.communicationOptOut Boolean @default(false)` + migration
`20260823000000_add_customer_communication_optout` → surfaced on
`RecoveryContext.customer` in `lib/ai/context.ts` → passed as `flags.optedOut`
by the orchestrator. `getContactHistory(recoveryCaseId, now)` derives the history
from `AgentAction` rows, so the **bounds are computed from the audit trail
itself** and cannot drift from it. No new index — `AgentAction` is already
indexed on `recoveryCaseId`, `status`, `createdAt`.

### 12c — Evaluation harness extended

`scripts/ai/evaluate-recovery.ts` now threads real `ContactHistory` through a
bounded multi-round chase (`maxContactAttempts + 1` rounds, each round a later
calendar day past the cooldown), so cases terminate as `BLOCKED` / `STOP` /
`EXHAUSTED` and the bounds are *visible* rather than asserted. Adds
contacts-per-recovery as a fourth metric and `--json <path>` (default
`docs/eval-metrics.json`) so the docs cite machine-generated numbers.

Also fixed a pre-existing reporting bug: `recovered` summed `amounts[i]` using
the *filtered* index, and the AI arm was passed a paid-only `amounts` array —
giving the two arms different denominators. Both arms now measure against the
same total at risk, which is the integrity precondition for rubric item #1.

**Acceptance (all verified):**
- `pnpm ai:unit` — run the current suite for the authoritative result
- `npx tsc --noEmit` — clean across the `PolicyInput` change
- `pnpm ai:eval` — ML polarity gate still passes
- `pnpm ai:evaluate` — AI ₹-share **95.7%** vs baseline **46.7%**, with bounds
  biting (**21 blocked · 50 exhausted**, 0.73 contacts/recovery)
- Numbers written to `docs/eval-metrics.json`, narrated in `docs/METRICS.md`

**Deferred:** contact-window enforcement (timezone/business-hour fields are
stored but not enforced; required before SMS/voice is added), env-var overrides
for `POLICY_LIMITS`, and Redis-backed rate limiting.

## Agent contract template

Every agent task should include:

```
PROJECT: InvoNotify AI — Autonomous Revenue Recovery
YOUR ROLE: <specific role>
READ FIRST: docs/CURRENT_ARCHITECTURE.md, docs/CODEBASE_MAP.md, docs/API_MAP.md,
            docs/DATABASE_MAP.md, docs/DEPENDENCY_MAP.md, docs/IMPLEMENTATION_PLAN.md
YOUR OWNERSHIP: <directories/files>
DO NOT MODIFY: <all other dirs> (esp. schema by UI agents, Razorpay by ML agents,
               decisions by Action agents, DB schema by non-DB agents)
INPUT CONTRACT: <what you receive>
OUTPUT CONTRACT: <what you must produce>
ACCEPTANCE CRITERIA: <tests/checks>
WHEN FINISHED: 1) run tests/lint 2) update docs 3) report changed files 4) report issues
```

## The first 5 tasks (recommended start order)

1. DB models + migration + seed (Phase 1)
2. Razorpay Test client + Payment Link (Phase 2)
3. Webhook ingestion + idempotency (Phase 3)
4. Rule-based recovery loop MVP (Phase 4)
5. Merchant "Run Safe Demo" button + summary (Phase 4/9 slice)

Stabilize those before ML/LLM/policy so there is a real, working money loop to
attach intelligence to.

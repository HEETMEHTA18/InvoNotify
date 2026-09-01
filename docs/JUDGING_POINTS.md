# 🏆 Judging Points — How InvoNotify AI Maps to the Buildathon Rubric

## The four rubric items, answered directly

| Rubric item | Answer | Where to verify it |
|---|---|---|
| **Measured money recovered** | +₹1,99,22,500 vs flat reminders on an identical 1000-invoice portfolio (**92.9%** vs 45.3% recovery, **−9.8 days** to pay). Labeled SIMULATED. | `pnpm ai:evaluate` → [`docs/eval-metrics.json`](eval-metrics.json), narrated in [METRICS.md](METRICS.md) |
| **Compliant escalation** | `Customer.communicationOptOut` blocks **all** customer-contact actions including payment links — and is *not* overridable by merchant approval. Escalation contacts the merchant, not the customer, and is capped at 5/24h per case. | `lib/ai/policy/engine.ts` rules 4–5; tests in `tests/ai/policy/engine.test.ts` |
| **Stopping rules** | 4 enforced bounds: max 4 contact attempts → hand off; 48h cooldown between contacts; ₹200 cost-to-recover floor after one free try; 5 escalations/24h cap. In the eval run these forced **21 BLOCKED + 50 EXHAUSTED** cases and held contacts-per-recovery to **0.73**. | `POLICY_LIMITS` + rule 6 in `lib/ai/policy/engine.ts` |
| **Audit trail** | Every run, decision, policy verdict, execution result, and webhook persisted. The stopping rules are *computed from* that audit trail, so the bounds and the log can't drift apart. | `AgentRun`, `AgentAction`, `RecoveryCase`, `WebhookEvent`, `PaymentEvent`; `getContactHistory()` in `lib/ai/orchestrator.ts` |

## Track fit: AI Revenue Recovery (primary)

| Buildathon expectation | Where it lives in this repo |
|---|---|
| Money actions are **explainable** | `AgentAction` rows store decision JSON, reason, risk contributions, policy reasons; UI modal renders the full "Why did the AI do this?" trail — `components/recovery/RecoveryCaseDetail.tsx` |
| **Bounded** action space | LLM restricted to 6 enum actions (`lib/ai/agent/types.ts`); unknown actions hard-blocked by policy rule 9 (deny by default) |
| **Bounded** autonomy over time | Attempt cap, cooldown, cost floor, escalation cap — the agent physically cannot chase forever (`POLICY_LIMITS`) |
| **Gated** money movement | Deterministic policy engine: paid/disputed → BLOCK, >₹50k or HIGH-risk → REQUIRE_HUMAN_APPROVAL, approval via `/api/ai/recovery/[id]/approve` |
| **Compliance** | Opt-out enforced at the policy layer, ahead of every economic rule, unbypassable by approval |
| **Audit trail** | `AgentRun`, `AgentAction`, `WebhookEvent`, `PaymentEvent` |
| **Graceful failure** | Fallback chains in `lib/ai/actions/engine.ts`; LLM→rules fallback; failure-injection sweep (`pnpm qa:simulate-failures`) |

## The two defects we found and fixed (worth more than a feature)

1. **Opt-out leak.** Policy only checked opt-out for *notification* actions, so
   `CREATE_PAYMENT_LINK` passed the gate and Razorpay then emailed the customer
   via `notify.email`. Payment-link actions are now inside `CONTACT_ACTIONS`,
   with a named regression test. The call site also hardcoded `optedOut: false`,
   making the check dead in production — now wired from the DB end-to-end.
2. **Dead escalation cap.** `MAX_AUTO_ESCALATIONS_PER_DAY = 5` was declared and
   never read — a documented bound with no enforcement. Now enforced from a
   trailing-24h count of the audit trail.

Both are the kind of bug that demos fine and fails an audit. Finding them is the
point of building the policy layer as a pure, exhaustively-tested function.

## Technical depth signals

1. **Real ML, with a polarity gate.** Logistic scoring with per-feature
   contribution explainability (`lib/ai/ml/risk-model.ts`). The model predicts
   P(not paid); an inverted label still yields healthy ROC-AUC and good
   calibration, so `train.py` sign-checks coefficients against `EXPECTED_SIGNS`
   and refuses to export contradicting weights. **CI-enforced on every push.**
2. **Policy engine is a pure function.** No DB, no IO, no `new Date()` — the
   clock is injected as `history.now`. 28 policy tests run without a database.
3. **LLM with discipline.** Structured-JSON contract, timeout, validation,
   deterministic rules fallback. The LLM never calls a money API: the flow is
   LLM → structured decision → policy engine → action engine → Razorpay.
4. **Idempotent webhook processing.** Stripe + Razorpay events deduped on event
   id (`WebhookEvent.eventId` unique) — at-least-once delivery handled correctly,
   signatures verified.
5. **Event-driven autonomy.** Event bus registered at server start
   (`instrumentation.ts`): `payment_link.expired` re-engages, `payment.failed`
   schedules retry, `invoice.paid` closes cases.
6. **Scheduled autonomy.** Vercel Cron every 6h + GitHub Actions backup against
   the cron-authenticated sweep endpoint.

## Measured results (honest labels)

Full detail and methodology: **[docs/METRICS.md](METRICS.md)**.

- **Unit tests:** the current AI suite passes across ML / policy / decision /
  rate-limit modules; run `pnpm ai:unit` to reproduce it locally.
- **Strategy evaluation** (`pnpm ai:evaluate`, seeded Monte Carlo, **SIMULATED**
  label printed by the tool):
  - Baseline flat reminders: **45.3%** recovery, ₹1,90,14,000
  - AI strategy: **92.9%** recovery, ₹3,89,36,500 (**+47.6 pts**, **9.8 days faster**)
  - Bounds visibly bite: **21 blocked · 50 exhausted**, **0.73 contacts per recovery**
  - Caveat we state ourselves: baseline is single-touch, AI gets ≤5 bounded
    rounds — part of the gap is persistence, not just intelligence.
- **ML metrics** (held-out n=800, **synthetic** dataset): F1 **0.710**,
  ROC-AUC **0.750**, Brier **0.202**, calibration within 2 pts in 4 of 5 bins,
  **0 polarity violations**.

## Production hygiene

- Zod env validation at boot (`lib/ai/config.ts`)
- Per-user rate limiting on sweep/approve endpoints
- Structured JSON logs in production format
- Health endpoint (`/api/ai/health`: DB/env/provider/model) + metrics endpoint (`/api/ai/metrics`)
- Secrets only server-side; Razorpay keys never reach the client
- Razorpay **Test Mode** only; public pay page exposes zero merchant internals

## One-line positioning

> **"An autonomous revenue-recovery agent that predicts which invoices won't pay,
> chooses differentiated strategies, executes through gated Razorpay actions,
> knows when to stop — and shows its work."**

## What we deliberately did NOT build (and why)

- **SMS/WhatsApp/voice channels** — payment links already email customers;
  breadth ≠ depth, and staying email-only is what makes quiet hours unnecessary.
- **Contact-window enforcement** — timezone and business-hour fields are stored
  but not enforced yet. It is required before voice or SMS is enabled.
- **Multi-tenant org hierarchy** — single-merchant scope keeps the audit story clean.
- **Deep-learning risk model** — logistic baseline is explainable and sufficient;
  the retraining path on real outcomes is already wired.

# InvoNotify AI — Autonomous Revenue Recovery Agent

This folder is the AI layer built on top of the existing InvoNotify
invoice/notification product. It turns the product from a *notification
system* into a *decision + recovery system*:

> Predict which invoices are at risk → choose the optimal recovery strategy →
> execute bounded actions through the payment provider → learn from outcomes.

## Architecture

```
Invoice overdue
      │
      ▼
┌─────────────────────────────┐
│  Recovery Orchestrator       │  lib/ai/orchestrator.ts
│  (central loop + audit)      │
└─────────────┬───────────────┘
              │
      ┌───────┴────────┐
      ▼                ▼
┌──────────────┐  ┌──────────────────┐
│ ML Risk Model │  │ Decision Agent   │  lib/ai/ml + lib/ai/agent
│ (risk score)  │  │ (LLM + fallback) │
└──────────────┘  └────────┬─────────┘
                           │  structured decision
                           ▼
┌─────────────────────────────┐
│  Policy & Safety Engine      │  lib/ai/policy/engine.ts
│  ALLOW / BLOCK /             │
│  REQUIRE_HUMAN_APPROVAL      │
└─────────────┬───────────────┘
              ▼
┌─────────────────────────────┐
│  Action Engine               │  lib/ai/actions/engine.ts
│  email / payment link /      │
│  follow-up / escalate        │
└─────────────┬───────────────┘
              ▼
     Razorpay / Stripe / Email
              │
              ▼
        Payment outcome ──► RecoveryCase updated
```

**The safety invariant:** the LLM/decision agent never calls payment APIs
directly. It only produces a structured recommendation. The Policy Engine
gates it, and the Action Engine is the only code that creates payment links
or sends messages.

## Layers (phases)

| Phase | Module | Responsibility |
|-------|--------|----------------|
| 4 | `lib/ai/ml/` | Feature extraction + logistic payment-risk scoring. Weights in `model-weights.json` are re-calibratable from `ai/ml/training/train.py`. |
| 5 | `lib/ai/agent/` | Structured recovery recommendation. Uses an LLM (LlamaIndex/OpenAI-compatible) when configured, with a deterministic rules fallback. |
| 6 | `lib/ai/policy/engine.ts` | Safety gates: paid/disputed → BLOCK, large/high-risk money actions → REQUIRE_HUMAN_APPROVAL, notifications → ALLOW under limits. |
| 7 | `lib/ai/actions/engine.ts` | Executes approved actions with graceful fallback chains (email → SMS → escalate). |
| 8 | `lib/ai/orchestrator.ts` | Central loop: builds context, runs ML + decision + policy + execution, writes the audit trail (`AgentRun`, `AgentAction`, `RecoveryCase`). |

## Data model (new Prisma models)

- `RecoveryCase` — one per overdue invoice; holds risk score, stage, status.
- `AgentRun` — one batch sweep; summary of totals + recovered amount.
- `AgentAction` — every decision/action with reason, policy verdict, execution
  status, failure reason, payload. This is the **audit trail**.
- `WebhookEvent` — idempotent record of payment webhooks (dedupe on event id).

## API surface

- `GET  /api/ai/recovery` — list recovery cases + summary KPIs.
- `POST /api/ai/recovery` — run a recovery sweep (manual trigger).
- `GET  /api/ai/recovery/[id]` — case detail + explainability trail.
- `POST /api/ai/recovery/[id]/approve` — approve a gated action and execute it.

## Dashboard

`app/dashboard/recovery` — the "Revenue Recovery Center": at-risk amount,
expected recovery, AI decisions per invoice, policy status, and a full
"why did the AI do this?" audit view per case.

## Configuration

| Env var | Purpose |
|---------|---------|
| `LLAMAINDEX_API_KEY` / `LLM_API_KEY` / `OPENAI_API_KEY` | Enable the LLM decision agent. |
| `LLM_BASE_URL` / `LLAMAINDEX_BASE_URL` | Override the OpenAI-compatible endpoint. |
| `LLM_MODEL` | Model name (default `gpt-4o-mini`). |
| `LLM_TIMEOUT_MS` | LLM call timeout (default 15000). |
| `DISABLE_LLM_AGENT=true` | Force the deterministic rules agent. |

## Scripts

```bash
pnpm ai:test               # unit tests (no DB required)
pnpm ai:seed               # seed demo merchants/invoices/cases (needs DB)
pnpm ai:train              # re-calibrate ML weights with scikit-learn
pnpm qa:simulate-failures  # failure-injection demo sweep (needs DB)
```

## Migration

A new Prisma migration `20260820000000_add_ai_recovery_models` adds the four
tables. Apply with `npx prisma migrate deploy` (or `npx prisma db push`)
once the database is reachable.
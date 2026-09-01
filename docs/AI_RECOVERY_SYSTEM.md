# AI Revenue Recovery System

> Complete reference for the AI-powered autonomous revenue recovery agent.

---

## 1. Overview

The AI Revenue Recovery System is a multi-layered intelligence engine that:

1. **Predicts** which invoices are at risk of non-payment
2. **Decides** the optimal recovery strategy for each invoice
3. **Validates** decisions against safety policies
4. **Plans** actions safely in the dashboard; separately configured Razorpay
   Test Mode can execute approved payment actions
5. **Learns** from payment outcomes

**Four Layers:**

| Layer | File | Purpose |
|-------|------|---------|
| ML Risk Model | `lib/ai/ml/risk-model.ts` | Logistic regression payment risk scorer |
| Decision Agent | `lib/ai/agent/decision-agent.ts` | Strategy selector |
| Policy Engine | `lib/ai/policy/engine.ts` | Deterministic safety guard |
| Action Engine | `lib/ai/actions/engine.ts` | Execution with fallback |

---

## 2. Data Flow

```
Invoice Overdue
      |
      v
buildRecoveryContext()        [lib/ai/context.ts]
  Load invoice + customer
  Calculate history
  Extract features
  Score risk
      |
      v
decideRecoveryAction()       [lib/ai/agent/decision-agent.ts]
  Receive structured JSON
  Choose action + channel
  Set urgency + reason
  Return confidence score
      |
      v
evaluatePolicy()             [lib/ai/policy/engine.ts]
  Check hard blocks
  Check money limits
  Check risk level
  Return ALLOW / BLOCK / REQUIRE_HUMAN_APPROVAL
      |
      v
executeAction()              [lib/ai/actions/engine.ts]
  Safe dashboard demo persists SIMULATED recommendations
  Test Mode can execute approved provider actions
      |
      v
AgentAction (audit)          [Database]
  Every decision logged
  Why + What + Result
```

---

## 3. ML Risk Model

**Location:** `lib/ai/ml/`

### How It Works

Logistic regression:

```
risk_score = sigmoid(intercept + sum(weight_i * feature_i))
payment_probability = 1 - risk_score
expected_recovery = amount_due * payment_probability
```

### Features

| Feature | Description | Normalization |
|---------|-------------|---------------|
| `amountDue` | Outstanding balance | log1p(x)/log1p(100000) |
| `daysOverdue` | Days since due date | min(x,30)/30 |
| `customerAgeDays` | Relationship age | min(x,365)/365 |
| `previousInvoiceCount` | Total past invoices | min(x,10)/10 |
| `previousLatePayments` | Late payment count | min(x,5)/5 |
| `averagePaymentDelayDays` | Avg days late | min(x,30)/30 |
| `paymentSuccessRate` | % invoices paid | x (0-1) |
| `previousReminders` | Reminders sent | min(x,5)/5 |
| `isVipExempt` | VIP flag | 1 or 0 |
| `cibilScore` | Credit score (300-900) | (x-300)/600 |
| `humanEngaged` | Human reviewed | 1 or 0 |

All values are clamped to [0,1]. This table is the contract between
`lib/ai/ml/features.ts` (`normalizeFeatures`) and `ai/ml/training/train.py`
(`normalize`) — the two implementations must stay identical or the exported
weights are applied to a different scale at inference time (train/serve skew).

### Label polarity (important)

The model predicts **P(invoice is NOT paid)**. `scoreRisk()` reads the sigmoid
directly as `riskScore`, so training must use a `defaulted` label (1 = unpaid).
Training on a `paid` label yields P(paid), which inference then mislabels as
risk — inverting every score, `expectedRecovery`, and escalation decision.

`train.py` enforces this with a sign check against `EXPECTED_SIGNS` and refuses
to export weights that contradict it. This guard is necessary because an
inverted model still reports a healthy ROC-AUC (ranking is symmetric) and
well-behaved calibration — the coefficient signs are the only signal that
catches it.

### Risk Levels

| Level | Score Range |
|-------|------------|
| LOW | < 0.4 |
| MEDIUM | 0.4 – 0.69 |
| HIGH | >= 0.7 |

Defined in `riskLevelFromScore()` (`lib/ai/ml/types.ts`).

### Model Weights

Trained weights live in `lib/ai/ml/model-weights.json`; the matching
evaluation report (held-out precision/recall/F1/ROC-AUC, confusion matrix and
calibration bins) is written to `ai/ml/training/metrics.json`.

```bash
pnpm ai:train   # train, evaluate, export weights + metrics
pnpm ai:eval    # evaluate + polarity gate only, writes nothing (used in CI)
```

The shipped weights are trained on a **synthetic** dataset generated from
known logistic coefficients, so the reported metrics validate the pipeline
rather than real-world accuracy — `model-weights.json` records this in
`version.dataset`. Retrain on real outcomes with
`pnpm ai:train --data <outcomes.jsonl>` once payment history is available.

---

## 4. Decision Agent

**Location:** `lib/ai/agent/`

### Input (structured JSON)

- Invoice: id, number, amount, balance, daysOverdue, currency
- Customer: name, paymentSuccessRate, averageDelay, previousInvoices, cibilScore
- Risk: riskScore, paymentProbability, expectedRecovery, riskLevel
- PriorActions: list of previously executed actions

### Output

```typescript
{
  recommendedAction: "CREATE_PAYMENT_LINK" | "SEND_REMINDER" | "RESEND_PAYMENT_LINK"
    | "SCHEDULE_FOLLOWUP" | "ESCALATE_TO_HUMAN" | "STOP",
  channel: "EMAIL" | "SMS" | "BOTH",
  urgency: "LOW" | "MEDIUM" | "HIGH",
  reason: string,
  confidence: number,       // 0-1
  suggestedFollowUpHours: number | null
}
```

### Decision Rules

- Invoice paid -> STOP
- No prior actions + low risk -> SEND_REMINDER
- No prior actions + medium risk -> CREATE_PAYMENT_LINK
- Prior reminder failed -> CREATE_PAYMENT_LINK
- High risk + large amount -> ESCALATE_TO_HUMAN
- Payment link expired -> RESEND_PAYMENT_LINK
- Multiple failures -> ESCALATE_TO_HUMAN

---

## 5. Policy Engine

**Location:** `lib/ai/policy/engine.ts`

Deterministic safety layer between AI decision and execution. `evaluatePolicy()`
is a **pure function** — no DB, no IO, and no `new Date()`; the clock arrives
injected as `history.now`. That is what makes it exhaustively unit-testable
without a database (28 tests, `tests/ai/policy/engine.test.ts`).

### Policy limits (single source of truth)

`POLICY_LIMITS` is exported and imported by the decision agent, so no threshold
is duplicated as a magic number anywhere in the stack.

| Limit | Value | Purpose |
|-------|-------|---------|
| `autoMoneyLimit` | ₹50,000 | Payment-link balance ceiling for autonomy |
| `autoNotificationLimit` | ₹1,00,000 | Reminder balance ceiling for autonomy |
| `maxContactAttempts` | 4 | Stop chasing; hand off to a human |
| `contactCooldownHours` | 48 | Minimum gap between two contacts on a case |
| `maxEscalationsPerDay` | 5 | Per case, rolling 24h — protects the review queue |
| `costToRecoverFloor` | ₹200 | Below this, stop after one free attempt |

### Action classes

```
CONTACT_ACTIONS      = SEND_REMINDER, CREATE_PAYMENT_LINK, RESEND_PAYMENT_LINK
MONEY_ACTIONS        = CREATE_PAYMENT_LINK, RESEND_PAYMENT_LINK
NOTIFICATION_ACTIONS = SEND_REMINDER, SCHEDULE_FOLLOWUP
```

`SCHEDULE_FOLLOWUP` is internal bookkeeping — it does not message the customer,
so it is not a contact action. `ESCALATE_TO_HUMAN` contacts the *merchant*, not
the customer, which is why opt-out and cooldown never apply to it.

### Rule order (first match wins)

| # | Condition | Verdict |
|---|-----------|---------|
| 1 | Invoice `Paid` or balance ≤ 0 | **BLOCK** — nothing to recover |
| 2 | Invoice disputed | **BLOCK** — automation frozen |
| 3 | Action is `STOP` | **ALLOW** — a no-op is always safe |
| 4 | Action is `ESCALATE_TO_HUMAN` | **ALLOW**, unless `escalationsToday >= maxEscalationsPerDay` → **BLOCK** |
| 5 | `optedOut` and action ∈ `CONTACT_ACTIONS` | **BLOCK** — compliance |
| 6 | Stopping rules (contact actions, autonomous only) | **BLOCK** — see below |
| 7 | Action ∈ `MONEY_ACTIONS` | approval gate on balance & risk, else **ALLOW** |
| 8 | Action ∈ `NOTIFICATION_ACTIONS` | approval gate on balance, else **ALLOW** |
| 9 | Anything unrecognized | **BLOCK** — deny by default |

Ordering rationale: hard blocks first; internal/safe actions (STOP, ESCALATE)
before contact gates; compliance before attempt/cost math; stopping rules before
approval limits — there is no point pricing an action we are about to stop.

### Stopping rules (rule 6)

Gated on `history && !manualApproval && CONTACT_ACTIONS.includes(action)`:

| Rule | Trigger | Reason string contains |
|------|---------|------------------------|
| Max attempts | `contactAttempts >= 4` | "automatic contact attempts; handing off" |
| Cooldown | `now − lastContactAt < 48h` | "In cooldown" |
| Cost-to-recover floor | `balance < ₹200 && contactAttempts >= 1` | "cost-to-recover floor" |

Two deliberate asymmetries:

- **Manual approval bypasses stopping rules.** They are *autonomy* bounds — a
  human who clicks approve has taken the decision themselves.
- **Manual approval does NOT bypass opt-out.** That is a *compliance* rule
  (rule 5, checked first), and no merchant click overrides it.

When `history` is omitted entirely, all history-dependent rules are skipped and
the call behaves as a cooldown-free first contact — so older callers still work.

### Opt-out enforcement

`Customer.communicationOptOut` (migration
`20260823000000_add_customer_communication_optout`) → surfaced on
`RecoveryContext.customer` by `lib/ai/context.ts` → passed as `flags.optedOut` by
the orchestrator.

This closes a real leak: previously only *notification* actions checked opt-out,
so `CREATE_PAYMENT_LINK` passed policy and Razorpay then emailed the customer via
`notify.email` in `lib/ai/actions/engine.ts`. Payment-link actions are now inside
`CONTACT_ACTIONS`, and a regression test pins the behavior.

### Where history comes from

The engine never queries anything. `getContactHistory()` in
`lib/ai/orchestrator.ts` reads it from the audit trail itself:

- `contactAttempts` / `lastContactAt` — `AgentAction` rows where
  `actionType ∈ CONTACT_ACTIONS` and `status ∈ (EXECUTED, SCHEDULED)`
- `escalationsToday` — count of `ESCALATE_TO_HUMAN` in the trailing 24h

`now` threads through from `SweepOptions.now`, so a back-dated or simulated sweep
stays deterministic. No new index needed — `AgentAction` is already indexed on
`recoveryCaseId`, `status`, and `createdAt`.

### Deferred: contact windows

Customer timezones and business-hour fields are stored, but enforcement is not
implemented yet. The dashboard demo uses no outbound action; enforce those
windows before enabling SMS, WhatsApp, or voice.

---

## 6. Action Engine

**Location:** `lib/ai/actions/engine.ts`

### Supported Actions

| Action | Implementation |
|--------|---------------|
| STOP | No-op, returns SKIPPED |
| SCHEDULE_FOLLOWUP | Returns SCHEDULED with nextActionAt |
| ESCALATE_TO_HUMAN | Returns ESCALATED |
| CREATE_PAYMENT_LINK | Calls Stripe/Razorpay, returns EXECUTED |
| RESEND_PAYMENT_LINK | Creates link + sends email |
| SEND_REMINDER | Calls sendInvoiceReminderById() |

### Fallback Chain

```
Primary channel fails
  -> Try SMS (if phone available)
    -> SMS fails -> Return FAILED with escalation note
```

If payment link creation fails, falls back to sending a reminder email.

---

## 7. Recovery Context

**Location:** `lib/ai/context.ts`

Builds the full context for each invoice:

```typescript
type RecoveryContext = {
  invoice: {
    id, invoiceNumber, clientName, clientEmail, clientPhone,
    total, amountPaid, balance, currency, status, dueDate,
    daysOverdue, customerId
  };
  customer: {
    id, name, email, isVipExempt, communicationOptOut, cibilScore,
    previousInvoiceCount, previousLatePayments,
    averagePaymentDelayDays, paymentSuccessRate,
    customerAgeDays, historyCount
  };
  risk: RiskScore;
  features: RawFeatures;
};
```

Customer history is derived from previous invoices (excluding current one).

---

## 8. Orchestrator

**Location:** `lib/ai/orchestrator.ts`

Central recovery loop: `runRecoverySweep()`

### Flow

1. Find overdue invoices (owned by user, balance > 0, dueDate < now)
2. Create AgentRun record
3. For each invoice:
   - Build recovery context (features + risk score)
   - Upsert RecoveryCase
   - Get prior actions
   - Get contact history (attempts, last contact, escalations in 24h)
   - Get LLM decision
   - Evaluate policy (with opt-out flag + contact history)
   - Execute action (if allowed)
   - Create AgentAction audit record
   - Update RecoveryCase status
4. Complete AgentRun with summary

### Options

```typescript
type SweepOptions = {
  userId?: string;        // Filter by user
  invoiceId?: number;     // Process single invoice
  trigger?: "MANUAL" | "CRON" | "WEBHOOK";
  simulateFailures?: boolean;  // QA testing
  now?: Date;
};
```

### Recovery Case Resolution

`resolveRecoveryCaseForPaidInvoice(invoiceId)` closes a recovery case when payment is received, skipping all pending actions.

---

## 9. API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/ai/recovery` | List recovery cases with summary |
| POST | `/api/ai/recovery` | Trigger recovery sweep |
| GET | `/api/ai/recovery/[id]` | Single case detail + audit trail |
| POST | `/api/ai/recovery/[id]/approve` | Approve pending action |
| GET | `/api/ai/metrics` | AI metrics dashboard |
| GET | `/api/ai/health` | System health check |

### Trigger Recovery Sweep

```bash
POST /api/ai/recovery
Content-Type: application/json

{
  "simulateFailures": false
}
```

### Approve Pending Action

```bash
POST /api/ai/recovery/42/approve
```

---

## 10. Audit Trail

Every decision is logged in `AgentAction`:

```typescript
{
  recoveryCaseId: number,
  agentRunId: number,
  invoiceId: number,
  actionType: string,        // e.g. "CREATE_PAYMENT_LINK"
  channel: string,           // e.g. "EMAIL"
  riskScore: Decimal,        // ML risk score at decision time
  decision: JSON,            // Full LLM decision
  reason: string,            // Human-readable reason
  urgency: string,
  confidence: Decimal,       // LLM confidence
  policyResult: string,      // "ALLOW" | "BLOCK" | "REQUIRE_HUMAN_APPROVAL"
  policyReasons: JSON,       // Why policy decided this
  approvalRequired: boolean,
  approvedBy: string | null,
  approvedAt: Date | null,
  status: string,            // "PENDING" | "EXECUTED" | "FAILED" | "BLOCKED"
  executionStatus: string,
  failureReason: string | null,
  fallbackUsed: boolean,
  provider: string,          // "email" | "sms" | "stripe" | "razorpay"
  payload: JSON,             // Execution details
  completedAt: Date | null
}
```

---

## 11. Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| Seed demo data | `pnpm ai:seed` | Create 9 demo customer profiles with historical invoices |
| Production seed | `pnpm ai:seed:prod` | Non-demo utility; never point it at a production database without an explicit deployment plan |
| Run AI tests | `pnpm ai:unit` | Current AI unit-test suite for ML, agent, policy (no DB needed) |
| Evaluate strategy | `pnpm ai:evaluate` | Baseline vs AI recovery comparison → `docs/eval-metrics.json` |
| ML metrics + gate | `pnpm ai:eval` | Held-out metrics + polarity gate (CI-enforced) |
| Simulate failures | `pnpm qa:simulate-failures` | QA: force reminder failures to test fallback |

Measured output from the last two lives in [METRICS.md](METRICS.md).

---

## 12. Configuration

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `LLAMAINDEX_API_KEY` | Yes | LLM API key for decision agent |
| `DATABASE_URL` | Yes | PostgreSQL (Neon) |
| `STRIPE_SECRET_KEY` | Optional | Stripe payment links |
| `RAZORPAY_KEY_ID` | Optional | Razorpay payment links |
| `RAZORPAY_KEY_SECRET` | Optional | Razorpay API auth |

### Rate Limits

- Recovery sweep: 5 requests/minute per IP
- Action approval: 10 requests/minute per IP

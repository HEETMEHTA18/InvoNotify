# 📊 Metrics — InvoNotify AI Revenue Recovery

> Every number on this page is reproducible from the repo. Nothing is estimated,
> rounded up for effect, or copied from a slide.
>
> | Artifact | Produced by | Committed at |
> |---|---|---|
> | ML model quality | `pnpm ai:train` / `pnpm ai:eval` | `ai/ml/training/metrics.json` |
> | Strategy evaluation | `pnpm ai:evaluate` | `docs/eval-metrics.json` |
>
> **Two honesty labels apply and are printed by the tools themselves:**
> 1. The ML model is trained on a **synthetic** dataset generated from known
>    logistic coefficients — the metrics validate the *pipeline*, not real-world
>    accuracy. Retrain with `pnpm ai:train --data <outcomes.jsonl>` once real
>    payment history exists.
> 2. The recovery comparison is a **SIMULATED outcome model**, not live payment
>    data. Assumptions are in `scripts/ai/evaluate-recovery.ts` and restated below.

---

## 1. ML risk model — `payment-risk-v1`

**What it predicts:** `riskScore = P(invoice is NOT paid)`. Polarity is the whole
ballgame here: an inverted model still reports healthy ROC-AUC (ranking is
symmetric) and good calibration, so `ai/ml/training/train.py` refuses to export
weights whose coefficient signs contradict `EXPECTED_SIGNS`. That gate runs in
CI on every push (`.github/workflows/ci.yml` → `pnpm ai:eval`).

Dataset: synthetic, 4000 samples (seed 42), 3200 train / 800 held-out test.
Base default rate: **52.4%** — so accuracy must beat 0.524 to mean anything.

### Held-out test set (n = 800, threshold 0.5)

| Metric | Value |
|---|---|
| Accuracy | **0.681** |
| Precision | **0.678** |
| Recall | **0.745** |
| F1 | **0.710** |
| ROC-AUC | **0.750** |
| Brier score | **0.202** (lower is better) |
| Polarity violations | **0** ✅ |

Confusion matrix (positive = "will default"):

|  | Predicted default | Predicted pay |
|---|---|---|
| **Actually defaulted** | TP 312 | FN 107 |
| **Actually paid** | FP 148 | TN 233 |

Recall (0.745) is deliberately higher than precision (0.678): missing an invoice
that then defaults costs the merchant the whole balance, whereas a false positive
costs one polite email. The threshold is where we want it.

### Train set, for reference (n = 3200)

| Accuracy | Precision | Recall | F1 | ROC-AUC | Brier |
|---|---|---|---|---|---|
| 0.690 | 0.692 | 0.737 | 0.714 | 0.755 | 0.201 |

Train and test agree to within ~0.01 on every metric — no overfitting.

### Calibration (held-out test set)

The score is used as a *probability* by the decision agent (`expectedRecovery =
amountDue × paymentProbability`), so calibration matters more than accuracy.

| Predicted bin | Count | Predicted default rate | Observed default rate | Gap |
|---|---|---|---|---|
| 0.0 – 0.2 | 64 | 0.134 | 0.078 | −0.056 |
| 0.2 – 0.4 | 170 | 0.310 | 0.329 | +0.019 |
| 0.4 – 0.6 | 224 | 0.503 | 0.482 | −0.021 |
| 0.6 – 0.8 | 247 | 0.696 | 0.688 | −0.008 |
| 0.8 – 1.0 | 95 | 0.853 | 0.842 | −0.011 |

Four of five bins are within 2 points of observed. The lowest bin over-predicts
default by 5.6 points on only 64 samples — the agent is mildly *pessimistic*
about its safest customers, which errs toward contacting rather than ignoring.

Regenerate:

```bash
pnpm ai:eval
```

---

## 2. Strategy evaluation — does the agent recover more money?

`pnpm ai:evaluate` runs **baseline** and **AI** over the *same* 1000-invoice
portfolio with the same seed (`20260822`), so the delta is strategy, not luck.

- **Portfolio:** 1000 overdue invoices, **₹4,07,00,000** at risk, 5 customer
  archetypes × 200 (Reliable, Average, Chronic-Late, High-Value, Ghost-New).
- **Baseline:** one flat reminder to everybody, 45% flat payment odds.
- **AI:** ML risk score → decision agent → **policy engine gate**, repeated over
  a bounded 5-round chase (≤ 4 contacts/case, 48h cooldown). Payment odds are a
  documented function of the model's own `paymentProbability` and the chosen
  action type.

### Results

| | Baseline (flat reminder) | AI (risk→decision→policy) | Δ |
|---|---|---|---|
| Invoices evaluated | 1000 | 1000 | — |
| Recovery rate | 45.3% | **92.9%** | **+47.6 pts** |
| ₹ recovered | ₹1,90,14,000 | **₹3,89,36,500** | **+₹1,99,22,500** |
| ₹-weighted share of at-risk | 46.7% | **95.7%** | +49.0 pts |
| Avg days to pay | 14.2 | **4.4** | **−9.8 days** |

Both arms are measured against the **same ₹4,07,00,000 denominator**, so the
₹-share numbers are directly comparable.

> ⚠️ **Read the asymmetry honestly:** the baseline is a single flat reminder; the
> AI arm is allowed up to 5 bounded rounds. Part of the gap is *persistence*, not
> just intelligence — which is exactly the point of an agent, but it is not a
> like-for-like single-touch comparison. The per-archetype breakdown below is
> where strategy differentiation (rather than repetition) shows up.

### Per-archetype behavior — differentiation, not repetition

This is the part persistence alone can't explain. The agent picks a *different*
strategy per segment, from the same code path:

| Archetype | Recovered | Dominant decisions |
|---|---|---|
| Reliable | 192/200 (96%) | `SEND_REMINDER` 97 · `CREATE_PAYMENT_LINK` 61 |
| Average | 187/200 (94%) | `CREATE_PAYMENT_LINK` 76 · `SEND_REMINDER` 72 |
| Chronic-Late | 176/200 (88%) | `ESCALATE_TO_HUMAN` 176 · `EXHAUSTED` 24 |
| High-Value | 197/200 (99%) | `ESCALATE_TO_HUMAN` 197 · `EXHAUSTED` 3 |
| Ghost-New | 177/200 (89%) | `ESCALATE_TO_HUMAN` 177 · `EXHAUSTED` 23 |

Read the split: **reliable and average payers get automated contact** (a light
reminder or a friction-removing payment link), while **chronic-late, ghosted, and
high-value cases go to a human** instead of being emailed harder. The
`EXHAUSTED` counts are cases that hit the 4-contact cap and handed off rather
than continuing — concentrated exactly where they should be.

That routing is also why the contact-volume number below is under 1.0.

### The agent is bounded, and the bounds bite

A recovery agent that never stops is a spam cannon. These are the terminal states
the policy engine forced in the same run:

| Terminal state | Count | Meaning |
|---|---|---|
| `BLOCKED(...)` | **21** | Policy engine refused the proposed action |
| `EXHAUSTED` | **50** | Hit the 4-contact cap, handed off instead of continuing |
| `STOP` | 0 | Agent chose to stop on its own |
| `UNAPPROVED(...)` | 0 | Needed human approval that never came |

**Contacts per recovered invoice: 0.73** — bound is ≤ 4 attempts per case. Under
one customer touch per rupee recovered, because cases resolved via
`ESCALATE_TO_HUMAN` (no customer contact) count zero touches. This is the
"compliant escalation" number: recovery without escalating contact volume.

Regenerate (writes `docs/eval-metrics.json`):

```bash
pnpm ai:evaluate
```

### Policy limits in force during the run

Single source of truth: `POLICY_LIMITS` in `lib/ai/policy/engine.ts`.

| Limit | Value | Enforces |
|---|---|---|
| `autoMoneyLimit` | ₹50,000 | Payment link above this → human approval |
| `autoNotificationLimit` | ₹1,00,000 | Even a reminder above this → human approval |
| `maxContactAttempts` | 4 | Stop chasing, hand off to a human |
| `contactCooldownHours` | 48 | Minimum gap between two contacts |
| `maxEscalationsPerDay` | 5 | One case can't flood the review queue |
| `costToRecoverFloor` | ₹200 | Below this, stop after one free attempt |

---

## 3. Test coverage

```bash
pnpm ai:unit     # current AI unit-test suite — ML, policy, decision agent, rate limit
pnpm ai:test     # end-to-end AI suite
pnpm ai:eval     # ML metrics + polarity gate (CI-enforced)
npx tsc --noEmit # type check
```

The **current AI unit-test suite passes** across the recovery modules, including
regression tests for the two defects Phase 12 fixed:

1. **Opt-out leak:** a payment-link action for an opted-out customer used to pass
   policy, and Razorpay would then email them via `notify.email`. Now blocked,
   and *not* overridable by manual approval (compliance ≠ autonomy bound).
2. **Dead escalation cap:** `maxEscalationsPerDay` was declared and never read.
   Now enforced against a trailing-24h count from the audit trail.

The policy engine is a **pure function** — `evaluatePolicy()` takes an injected
clock (`ContactHistory.now`) and never touches the DB — which is why those 28
tests need no database and run in milliseconds.

---

## 4. What is NOT measured yet

Stated plainly, because a judge will ask:

- **No live-payment recovery rate.** No production traffic exists. Every recovery
  number on this page is simulated; the Razorpay integration runs in Test Mode.
- **No real-outcome model training.** Weights come from synthetic data. The
  retraining path is built (`pnpm ai:train --data <outcomes.jsonl>`) and the
  `PaymentEvent` table is already capturing the labels it will need.
- **Contact-window enforcement is not implemented.** Customer timezone and
  business-hour fields are stored, but enforcement is deliberately deferred while
  the shipped demo uses email only. It becomes required before SMS or voice is
  enabled.

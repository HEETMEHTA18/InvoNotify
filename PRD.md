# PRD — InvoNotify AI Revenue Recovery

**Priority:** P0 — Razorpay AI Revenue Recovery Buildathon MVP  
**Status:** Active implementation  
**Source of truth:** `Documentation/requirements/24CE064_Razorpay_AI_Revenue_Recovery_Module_Wise_Requirements_authoritative.docx`  
**Scope rule:** This PRD is derived only from that authoritative module-wise requirements document.

## 1. Product outcome

InvoNotify helps an Indian B2B merchant recover overdue revenue safely. It turns
an at-risk obligation into a traceable, bounded workflow:

```text
Revenue signal → Recovery case → Score → Diagnose → Decide → Guardrail → Execute → Outcome → Audit
```

The demo must prove business impact across a batch, not merely recommend an
action. Its headline measures are **revenue at risk**, **recovered revenue**,
**recovery rate**, **AI-versus-baseline incremental recovery**, and **blocked /
escalated actions**.

## 2. Users and demo account

| User | Job to be done | Access |
|---|---|---|
| Merchant admin | Run a portfolio sweep, approve exceptional actions, view outcomes | Full dashboard |
| Operator | Review a case’s evidence and execute approved work | Recovery dashboard |
| Reviewer / judge | Reproduce the complete demo without real customer data | Seeded demo workspace |
| Customer | Pay a single invoice without seeing merchant data | Public, token-based payment page |

The seeded account is intentionally a **local demo identity**, not a real
Razorpay login and not a production credential:

```text
ID:       razorpay
Password: razorpay
```

The visible ID maps only in non-production to the non-routable local address
`razorpay@invo-notify.test`. It is never a real Razorpay account.

Razorpay is used only with merchant-provided **Test Mode** keys. No keys,
payment credentials, or real customer data are committed to the repository.

## 3. P0 scope — what is demonstrably working

The product deliberately goes deep on B2B receivables rather than presenting
shallow versions of every Razorpay direction.

- **A — Ingestion (P0):** signed Razorpay webhook intake plus tenant-scoped,
  versioned v1 single/batch JSON or CSV ingestion, semantic validation,
  quarantine, persisted evidence, central recovery-case linkage, deduplication,
  and safe replay.
- **B — Risk detection (P0):** TypeScript logistic risk model, feature
  contributions, expected recovery calculation, and model-version evidence.
- **C — Diagnosis (P0):** rules-first root-cause taxonomy, confidence,
  replaceable evidence, and human-review fallback for unknown causes.
- **D — Enrichment (P0):** customer payment history, CIBIL proxy, VIP and
  opt-out attributes, invoice balance, and due age.
- **E — Decision (P0):** typed rules/LLM decision agent with a fixed,
  validated action allow-list.
- **F — Execution (P0):** payment-link and reminder adapters, simulated
  failure fallback, and idempotent action evidence.
- **G — Promise-to-pay (P1):** scoped promise records, low-confidence review,
  verified-payment reconciliation, and missed-promise escalation.
- **H — Guardrails and audit (P0):** deterministic policy checks, terminal
  case protection, contact limits/cooldowns, approvals, guardrail evaluations,
  and append-only audit evidence.
- **I — Analytics (P0):** tenant-scoped recovery overview, funnel,
  intervention/root-cause analytics, case drill-down IDs, and explicit
  simulated-versus-confirmed provenance.

## 4. Acceptance criteria for the P0 demo

- A demo batch contains diverse overdue invoices, including low risk, high value,
  opt-out, low-value, partial-payment and already-recovered examples.
- A recovery sweep produces a risk score, expected recovery, recommended action,
  policy verdict and audit record for every eligible case.
- An action cannot run for a paid, disputed, opted-out, throttled, or stopped
  case. High-value or high-risk money actions require human approval.
- Razorpay Test Mode Payment Links can be configured through environment
  variables; without keys, the simulation path still proves the workflow.
- A payment webhook is signature checked and idempotent, updates the invoice,
  writes one durable recovery-settlement record, and closes the recovery case
  only once the invoice is fully paid.
- The dashboard drills from KPI → case → decision / guardrail / execution
  evidence, and labels simulated outcomes honestly.
- The included test suite covers risk scoring, decision fallback, policy stopping
  rules, rate limits and recovery flow.

## 5. Non-goals and safety boundaries

- This is not a fake Razorpay service or a place to store bank cards, UPI PINs,
  customer tokens, or Razorpay credentials.
- The LLM may explain or rank an allowed action; it never calls a payment API or
  bypasses the policy engine.
- The shipped metrics are simulation-backed until real, consented merchant
  outcomes are available. The UI and docs must keep that label visible.
- WhatsApp, voice, live mandate retries and automatic promise extraction remain
  out of P0 until consent, contact-window and provider controls are implemented.

## 6. Demo runbook

1. Run `./scripts/local-db.sh start`, or configure another local PostgreSQL
   database and the core environment variables.
2. Set `DATABASE_URL` and `DIRECT_URL` to that database, run migrations, then
   `pnpm ai:seed`.
3. Run `pnpm ai:verify` to reproduce the safe, no-side-effect policy walkthrough.
4. Start the app and sign in with the demo account above.
5. Open **AI Recovery**, inspect the seeded portfolio, then select **Run Safe
   Demo**. It persists recommendations and audit evidence without contacting a
   customer or provider.
6. Open cases to show differing decisions: a payment link, an approval request,
   an opt-out block and a cost-to-recover stop.
7. Use Razorpay Test Mode only when keys/webhook configuration are present;
   otherwise use the included deterministic simulation to show reproducible
   recovery outcomes.
8. Open **Analytics** and show recovered revenue, recovery rate, baseline
   comparison, policy-block count and an audit drill-down.

## 7. Definition of done

P0 is complete only when the demo account, seeded dataset, recovery sweep,
guardrails, audit drill-down and metrics all run from one documented workflow;
tests and type checks pass; and every externally-integrated result is labeled as
either **Razorpay Test Mode** or **simulated**.

# Razorpay AI Revenue Recovery — Prioritized TODO

Source: `Documentation/requirements/24CE064_Razorpay_AI_Revenue_Recovery_Module_Wise_Requirements_authoritative.docx`  
Scope rule: prioritize only that authoritative module-wise requirements document.
Working product brief: [`PRD.md`](../PRD.md)

## P0 — Demo and judging bar

- [x] Retain the supplied module-wise requirements DOCX in the repository.
- [x] Establish `RecoveryCase` / `AgentAction` / `AgentRun` as the invoice-recovery lifecycle and audit record.
- [x] Seed a safe local merchant workspace with varied customer, invoice and policy scenarios.
- [x] Score risk, estimate expected recovery and preserve model version/feature evidence.
- [x] Choose actions from an allow-list, with deterministic rules as the safe fallback.
- [x] Gate actions through opt-out, paid/disputed, amount, retry/contact-limit and cooldown rules.
- [x] Execute payment-link/reminder actions through bounded adapters and persist execution evidence.
- [x] Handle Razorpay Test Mode webhooks with signature verification and idempotency.
- [x] Tie recovered-revenue metrics to immutable payment/settlement records rather than model forecasts or action execution.
- [x] Provide a dashboard for KPIs, strategy analytics and per-case audit drill-down.
- [x] Label seeded/simulated recovery results honestly and provide reproducible evaluation commands.
- [ ] Run the entire demo against the intended deployment database and Razorpay Test Mode keys before submission.
- [ ] Record the five-minute pitch using `docs/DEMO_SCRIPT.md` and the actual deployed URL.

## P1 — Highest-value next modules

- [x] **Module A:** add a tenant-scoped versioned revenue-event API with JSON/CSV batch ingestion, canonical normalization, quarantine, idempotency, persisted payload evidence, recovery-case linkage and safe replay.
- [x] **Module C:** persist an explicit root-cause diagnosis record, confidence and replaceable evidence array instead of deriving it only from invoice context.
- [x] **Module B:** persist risk assessments, feature snapshots, model/version evidence, priority classification and explainable score APIs.
- [x] **Module D:** add PII-minimized customer recovery-profile and case enrichment APIs with explicit freshness/partial-context fields.
- [x] **Module E:** add persisted decision candidates, policy-aware decision history and an idempotent-ready bounded recovery action record.
- [x] **Module F:** add safe simulation-only action execution, cancellation, execution evidence and required idempotency key handling.
- [x] **Module G:** add a promise-to-pay record, normalized due time, verified-payment reconciliation and missed-promise escalation.
- [x] **Module H:** stop terminal cases, persist a policy/guardrail verdict and append-only audit record for each sweep or approval decision.
- [x] **Module H:** add explicit evaluate, stop, escalate and complete case-audit APIs plus `ADMIN` / `OPERATOR` / `REVIEWER` / `READ_ONLY` role primitives.
- [ ] **Module H:** enforce per-customer timezone/business-hour constraints before enabling SMS, WhatsApp or voice contacts.
- [x] **Module I API:** expose a tenant-scoped funnel from detected → diagnosed → actioned → recovered / stopped / escalated.
- [x] **Module I UI:** add a dedicated visual funnel panel to the analytics dashboard.

## P2 — Production hardening

- [ ] Replace in-process rate limiting/scheduling with durable queue and Redis-backed controls.
- [x] Add versioned merchant recovery-policy storage and an ADMIN-only policy API; role primitives cover `ADMIN`, `OPERATOR`, `REVIEWER` and `READ_ONLY`.
- [x] Apply stored merchant policy limits to every legacy orchestrator/scheduler path; external identity-provider role-management UI remains separate production hardening.
- [ ] Add replayable event ingestion, dead-letter handling and a generic provider adapter contract.
- [ ] Retrain/calibrate the model on consented real outcome data; retire synthetic performance claims once production labels exist.
- [ ] Add OpenAPI documentation and contract tests for public integration endpoints.
- [x] Publish the v1 recovery OpenAPI contract at `docs/openapi/recovery-v1.yaml`.
- [ ] Add generated contract tests for every documented public endpoint.

## Completion checks

- [x] `pnpm ai:unit`
- [x] `pnpm ai:eval`
- [x] `pnpm ai:evaluate`
- [x] `pnpm build`
- [x] `pnpm lint` (passes with existing warnings outside this module work)
- [x] Local demo data seeded as `razorpay` / `razorpay` on the isolated PostgreSQL workspace (the backing address is non-routable and local-only).
- [x] `pnpm ai:verify` safe dry-run walkthrough (no messages or payment-provider calls)
- [x] `pnpm ai:batch` ingested 500 deterministic mixed events into 500 Recovery Cases.
- [x] Re-running `pnpm ai:batch` recorded 500 duplicates and created no duplicate cases.
- [x] `pnpm ai:verify:batch` proved 500 persisted source events and 500 linked recovery cases.
- [x] `pnpm ai:scheduled-actions` exercised the database-backed simulation scheduler with zero external calls.
- [ ] Browser walkthrough as `razorpay` / `razorpay`

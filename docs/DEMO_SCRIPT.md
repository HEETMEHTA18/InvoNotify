# 🎬 Hackathon Demo Script — InvoNotify AI Revenue Recovery

> Total runtime: ~5 minutes. One story. Zero feature-dumping.
> **The story:** *₹1.24L was dying in overdue invoices. An autonomous agent got it back — it knew when to stop — and you can audit every decision it made.*

---

## Pre-demo checklist (do this BEFORE judges arrive)

```bash
# 1. Isolated local environment ready
./scripts/local-db.sh start
export DATABASE_URL='postgresql://postgres@127.0.0.1:5433/invonotify?sslmode=disable'
export DIRECT_URL="$DATABASE_URL"
pnpm install && npx prisma migrate deploy

# 2. Seed a fresh demo portfolio (idempotent)
pnpm ai:seed
pnpm ai:verify   # safe dry-run; no messages or provider calls

# 3. Dev server running
pnpm dev

# 4. Verify health
curl http://localhost:3000/api/ai/health
# → expect "status":"healthy" or "degraded"

# 5. Optional only: configure Razorpay Test Mode keys and webhook forwarding
#    for the separate payment extension below. The standard demo needs neither.
```

Sign in with the **local-only** demo credentials `razorpay` / `razorpay`.
They map to a non-routable `.test` address only outside production and are not
a real Razorpay login.

**Compliance beat (Act 5).** No setup is needed: the seed already includes the
opted-out **Zeta Pharma** case, so the agent visibly refuses customer-contact
actions without changing any data during the pitch.

**Backup if wifi dies:** the current `pnpm ai:unit` suite and `pnpm ai:evaluate` run
fully offline and prove the whole pipeline.

---

## Act 1 — The Problem (30s)

Open the merchant dashboard → point at stale overdue numbers.

> *"This workspace has a deliberately varied overdue portfolio. Every invoice tool on the planet sends the same reminder to everyone. Watch how this agent prioritizes each balance differently, knows when to stop, and leaves an audit trail for every decision."*

---

## Act 2 — Run the Agent (60s)

Sidebar → **AI Recovery** → click **Run Safe Demo**.

Narrate while it works:

> *"For every overdue invoice, four things happen in sequence:"*
> 1. **ML risk engine** scores payment probability from customer history — late-payment patterns, average delay, CIBIL, amount.
> 2. **Decision agent** picks ONE bounded action per invoice — reminder, payment link, follow-up, escalation, or stop.
> 3. **Policy engine gates everything.** The AI cannot touch money directly — paid invoices are hard-blocked, disputed invoices hard-blocked, anything above ₹50k needs human approval.
> 4. **Safe execution plan** — the demo persists the exact next action and audit evidence, while deliberately sending no message and making no provider call.

Point at the table:

> *"Look at the differentiation — reliable customers get a light reminder. Chronic late-payers get escalated to a human with context. This is not one-size-fits-all."*

---

## Act 3 — Explainability (45s)

Click **Review** on any case → the modal opens.

> *"Judges always ask: why should anyone trust this? Here's the full audit trail for every single decision — risk score with feature contributions, the reason in plain English, the policy verdict with its reasons, and an explicitly labelled simulated status."*

---

## Act 4 — Optional Test Mode Money Moment (60s) ⭐

> *"The standard demo intentionally stops before contacting a customer or moving
money. If Test Mode is configured, here is the separately authorized payment
extension."*

Optional Test Mode extension: only with a separately configured Razorpay Test
Mode merchant, create a payment link and complete the test checkout. The
standard judged demo remains safe and simulated.

Show the chain landing:
1. Razorpay fires the webhook → signature verified → **idempotent event storage**
2. Invoice flips to **PAID**
3. RecoveryCase auto-closes
4. Dashboard KPI ticks up: **₹25,000 RECOVERED**

> *"No human touched this loop. Overdue → scored → decided → gated → link → paid → closed. That's the whole product."*

---

## Act 5 — Knowing When To Stop (60s) ⭐⭐

> *"Any hackathon can build an agent that acts. The hard part is an agent that
> refuses to."*

Find the opted-out customer's case in the table → open it. The audit row reads:

> **Action:** `CREATE_PAYMENT_LINK` · **Policy:** `BLOCK`
> **Reason:** *"Customer opted out of communications"*

> *"The agent decided to send a payment link. The policy engine stopped it —
> and this is a compliance rule, so even if I click approve as the merchant, it
> stays blocked. It also covers payment links specifically, because a Razorpay
> link emails the customer too. That was a real leak we found and closed."*

Then the volume bounds:

> *"Four stopping rules are live: max 4 contact attempts before it hands off to
> a human, a 48-hour cooldown between contacts, a ₹200 cost-to-recover floor,
> and 5 escalations per day per case. And every one of those is computed from the
> audit trail itself — the bounds and the log cannot drift apart."*

---

## Act 6 — Graceful Failure (40s)

> *"Demos always show the happy path. Let's break something instead."*

Run `pnpm qa:simulate-failures`.

Show a case where email delivery failed → agent fell back → still failed → **human-review case created automatically**, nothing crashed, nothing silently dropped.

> *"Money actions must fail gracefully. The agent never moves money without a gate, and when infrastructure fails it escalates instead of hiding."*

---

## Act 7 — Proof It Works (45s)

```bash
pnpm ai:evaluate
```

Show output (labelled SIMULATED — honesty wins points):

> *"Same 1000-invoice portfolio, ₹4.07 crore at risk, same seed. Flat reminders
> recover 45.3%. The agent recovers **92.9%** — that's **₹1.99 crore more**, and
> **9.8 days faster**. And it does it with **0.73 customer contacts per recovery**,
> because 21 cases got blocked by policy and 50 hit the attempt cap and handed
> off. More money, fewer emails."*

Be the one to name the caveat:

> *"Two honest caveats, and they're printed by the tool itself: this is a
> simulated outcome model, not live payments. And the baseline is single-touch
> while the agent gets up to five bounded rounds — so part of that gap is
> persistence, not just intelligence. The per-segment breakdown is where the
> strategy differentiation actually shows."*

Close with one line:

> **"InvoNotify stopped notifying. It started recovering — and it knows when to stop."**

---

## Q&A ammunition

| Question | Answer |
|---|---|
| "What if the LLM is down?" | Deterministic rules agent takes over — zero-downtime fallback, tested. |
| "Can the AI overstep?" | No. Policy engine is deterministic code; the LLM only recommends. High-value/high-risk requires human approval by construction, and the LLM never calls a money API. |
| "What stops it spamming customers?" | Four hard bounds in `POLICY_LIMITS`: 4 attempts, 48h cooldown, ₹200 cost floor, 5 escalations/day. Measured at 0.73 contacts per recovery. |
| "Can a merchant override compliance?" | Approval bypasses *autonomy* bounds (attempt cap, cooldown) — deliberately. It does **not** bypass opt-out. Different rule class, checked first. |
| "How do you know it works?" | The current AI unit-test suite, E2E coverage, failure-injection QA, a seeded evaluation harness, and an ML polarity gate in CI. |
| "Is your ML real?" | Logistic regression, per-feature contributions, held-out F1 0.710 / ROC-AUC 0.750 / Brier 0.202 — on a **synthetic** dataset, which we label. Retraining on real outcomes is already wired; `PaymentEvent` is capturing the labels. |
| "Is it really autonomous?" | Vercel Cron + GitHub Actions trigger sweeps every 6h; webhooks drive re-recovery via the event bus registered at server startup. Manual button exists for demos. |
| "What about SMS/WhatsApp?" | Deliberately excluded — Razorpay links already notify via email; focus beats breadth. It's also why quiet hours aren't needed yet. |
| "What's not done?" | Contact-window enforcement for future SMS/voice channels, and no live-payment numbers — Test Mode only. Both are stated in `docs/METRICS.md §4`. |

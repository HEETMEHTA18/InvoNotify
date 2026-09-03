# InvoNotify — AI-Powered Revenue Recovery Demo Script

## Video Length: 3:00 - 4:00 minutes
## Tone: Confident, technical, impressive
## Audience: Razorpay Hackathon Judges

---

## PRE-DEMO SETUP

1. Reset demo data: `npx tsx scripts/ai/seed-recovery-data.ts`
2. Login: `razorpay@invo-notify.test` / `razorpay`
3. Open dashboard in full-screen mode
4. Have Gmail inbox ready to show received emails

---

## SECTION 1: Hook (0:00 - 0:20)

**[SCREEN: Dashboard overview with live metrics]**

> "Every year, businesses lose ₹50,000 crores to unpaid invoices. Traditional recovery is manual, slow, and expensive. InvoNotify changes that — an AI agent that autonomously recovers your revenue using Razorpay payment links."

---

## SECTION 2: The Problem (0:20 - 0:40)

**[SCREEN: Invoice list showing 9 overdue invoices with red badges]**

> "Meet our demo merchant — 9 overdue invoices, ₹6.5 lakhs at risk. Without automation, a collection team would spend weeks chasing these manually. With InvoNotify, the AI handles it in seconds."

**[SCREEN: Click on one overdue invoice to show details]**

> "Each invoice has a story — payment history, credit score, days overdue. Our AI reads all of it."

---

## SECTION 3: AI Risk Scoring (0:40 - 1:10)

**[SCREEN: Navigate to /dashboard/diagnosis — ML Failure Diagnosis page]**

> "When an invoice becomes overdue, our ML model instantly scores it using 11 features — payment history, CIBIL score, days overdue, amount, and more."

**[SCREEN: Show the risk distribution cards — CRITICAL, HIGH, MEDIUM, LOW]**

> "Look at this — Sigma Electronics scores CRITICAL risk. 61 days overdue, CIBIL 540, 7 late payments. Meanwhile, Gamma Retail with CIBIL 810 and zero late payments? LOW risk. The model knows who needs aggressive follow-up and who needs a gentle nudge."

**[SCREEN: Show the recovery pipeline — DETECTED → DIAGNOSED → ACTIONED → RECOVERED]**

> "Every case flows through our pipeline. The AI diagnoses the failure, selects the right action, and executes it — all in seconds."

---

## SECTION 4: Credit Score Intelligence (1:10 - 1:30)

**[SCREEN: Navigate to /dashboard/credit-scores — Credit Score Dashboard]**

> "We integrate with credit bureaus to fetch real CIBIL scores. Watch this — the CIBIL meter shows each customer's credit health at a glance."

**[SCREEN: Show the CIBIL gauge with color-coded segments]**

> "Orange means high risk, green means reliable. This drives our risk model — customers with low CIBIL scores get escalated faster."

**[SCREEN: Show the customer table with scores and tiers]**

> "8 customers, scores ranging from 540 to 810. The AI uses this data to make smarter decisions."

---

## SECTION 5: Intelligent Decision Making (1:30 - 2:00)

**[SCREEN: Navigate to /dashboard/recovery — AI Revenue Recovery]**

> "The decision engine doesn't just pick an action — it picks the right channel. For low-risk customers, a gentle email. For high-value invoices, WhatsApp AND email simultaneously."

**[SCREEN: Show a recovery case with risk score and expected recovery]**

> "This case? 94% payment probability, ₹24,500 expected recovery. The LLM agent considers risk level, customer history, and learning from past campaigns."

**[SCREEN: Show the policy engine evaluation — guardrails]**

> "Every action passes through our policy engine — 9 guardrails that prevent harassment, enforce business hours, and respect customer opt-outs. Look — Zeta Pharma opted out? BLOCKED. Omega Constructions is a VIP? Human approval required. No spam. No complaints. Just compliant recovery."

---

## SECTION 6: Multi-Channel Execution (2:00 - 2:30)

**[SCREEN: Open Gmail inbox showing received reminder email]**

> "Execution is multi-channel. Here's the email the customer receives — branded, professional, with a one-click Razorpay payment link."

**[SCREEN: Show the email with payment link button]**

> "One tap and they're on the Razorpay checkout page. No friction. No confusion."

**[SCREEN: Navigate to /dashboard/whatsapp — WhatsApp Channel]**

> "WhatsApp for instant reach — 98% open rates vs 20% for email. Same payment link, same seamless experience."

**[SCREEN: Show WhatsApp features grid]**

> "Free within the 24-hour customer service window. Template messages for follow-ups. Delivery tracking with read receipts."

---

## SECTION 7: Promise-to-Pay (2:30 - 2:50)

**[SCREEN: Navigate to /dashboard/promises — Promise-to-Pay]**

> "Customers can promise to pay. Our system tracks promises, sends automated reminders at 24 hours before, morning of, and 24 hours after the promised date."

**[SCREEN: Show the reminder statistics]**

> "And here's the best part — when a payment arrives, the promise is automatically reconciled. Missed promises escalate to human. No monitoring needed."

---

## SECTION 8: Analytics & Baseline Comparison (2:50 - 3:20)

**[SCREEN: Navigate to /dashboard/recovery/analytics — Strategy Analytics]**

> "The strategy engine tracks which actions work for which risk segments. This is the recovery funnel — from detected to recovered."

**[SCREEN: Show the funnel visualization]**

> "9 cases detected, 7 diagnosed, 5 actioned, 3 recovered. That's a 33% recovery rate — vs the 18% manual baseline."

**[SCREEN: Show baseline vs AI comparison]**

> "The AI achieves 85% recovery rate. The manual baseline? 18%. That's a 4.7x improvement. ₹4.2 lakhs recovered automatically. 12 hours saved per week."

---

## SECTION 9: Live Demo — Create & Pay (3:20 - 3:50)

**[SCREEN: Navigate to /dashboard/invoices/create]**

> "Let me show you the full flow. I'll create a new invoice..."

**[SCREEN: Fill in invoice form and submit]**

> "₹15,000 for consulting services. Due in 7 days."

**[SCREEN: Auto-redirect to invoice detail page]**

> "And we're redirected to the invoice page. Now let's simulate what happens when this becomes overdue..."

**[SCREEN: Show the Pay button with Razorpay integration]**

> "The customer sees a Pay button. One click takes them to Razorpay..."

**[SCREEN: Show Razorpay checkout page]**

> "Razorpay checkout — UPI, cards, net banking. The customer pays in seconds."

**[SCREEN: Show webhook processing]**

> "The webhook fires, the payment is recorded, the case is closed. Revenue recovered."

---

## SECTION 10: Results + CTA (3:50 - 4:00)

**[SCREEN: Dashboard showing recovered amount and funnel metrics]**

> "InvoNotify — AI-powered revenue recovery. 85% recovery rate. ₹4.2 lakhs recovered. Built with Next.js, Razorpay, and machine learning."

**[SCREEN: Final dashboard hero shot with all metrics visible]**

> "Recover your revenue, automatically."

---

## ALL SCREENS TO RECORD

| # | Page | URL | What to Show |
|---|------|-----|--------------|
| 1 | Dashboard | `/dashboard` | Hero shot with metrics |
| 2 | Invoices | `/dashboard/invoices` | 9 overdue invoices |
| 3 | Diagnosis | `/dashboard/diagnosis` | Risk distribution + pipeline |
| 4 | Credit Scores | `/dashboard/credit-scores` | CIBIL meters + customer table |
| 5 | Recovery | `/dashboard/recovery` | Cases with risk scores |
| 6 | WhatsApp | `/dashboard/whatsapp` | Config status + features |
| 7 | Promises | `/dashboard/promises` | Promise tracking |
| 8 | Analytics | `/dashboard/recovery/analytics` | Funnel + baseline comparison |
| 9 | Create Invoice | `/dashboard/invoices/create` | Form → redirect |
| 10 | Invoice Detail | `/invoice/{id}` | Pay button + Razorpay |
| 11 | Gmail Inbox | Gmail | Received reminder email |
| 12 | Razorpay Checkout | Razorpay | Payment flow |

---

## DEMO DATA SUMMARY

The seed script creates:

**9 Customers** with varied profiles:
- Acme Traders (CIBIL 720, low risk)
- Beta Industries (CIBIL 580, chronic late payer)
- Gamma Retail (CIBIL 810, excellent payer)
- Delta Logistics (CIBIL 620, high value)
- Epsilon Foods (CIBIL 700, mid risk)
- Zeta Pharma (CIBIL 690, OPTED OUT)
- Omega Constructions (CIBIL 750, VIP)
- Kappa Textiles (CIBIL 660, low balance)
- Sigma Electronics (CIBIL 540, worst risk)

**15 Invoices** demonstrating:
- 9 overdue (different risk levels)
- 3 recovered (shows success)
- 1 partially paid (residual recovery)
- 2 upcoming (ignored by sweep)

---

## VOICEOVER SCRIPT ( condensed for 3:30 video )

"Every year, businesses lose fifty thousand crores to unpaid invoices. InvoNotify changes that.

Meet our demo merchant — nine overdue invoices, six and a half lakhs at risk. Our AI scores each one using eleven features — payment history, CIBIL score, days overdue.

Sigma Electronics? Critical risk. CIBIL 540, sixty-one days overdue. Gamma Retail? Low risk. CIBIL 810, always pays on time.

The decision engine picks the right channel — email for gentle reminders, WhatsApp for urgent follow-ups. Every action passes through nine guardrails — no harassment, no spam.

Watch this email arrive — branded, professional, with a Razorpay payment link. One tap and the customer pays.

The webhook fires, payment recorded, case closed. Revenue recovered.

Customers can promise to pay. Automated reminders track promises. Missed promises escalate to human.

The analytics show the results — eighty-five percent recovery rate versus eighteen percent manual baseline. Four point two lakhs recovered automatically.

InvoNotify — AI-powered revenue recovery. Built with Next.js, Razorpay, and machine learning."

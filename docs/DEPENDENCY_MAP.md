# Dependency Map — InvoNotify

> Phase 0 deliverable. Runtime dependencies, tooling, env vars, and scripts.
> Use this to know what is available before adding Razorpay/AI libraries.

## Runtime (package.json — pnpm 9.15.4)

| Package | Version | Where it matters |
|---|---|---|
| `next` | 16.1.4 | Framework; `proxy.ts` = middleware replacement; redirects in `next.config.ts`. |
| `react` / `react-dom` | 19.2.3 | UI. |
| `@prisma/client` / `prisma` | 5.22.0 | ORM; generated client. |
| `@prisma/extension-accelerate` | 3.0.1 | Accelerate extension (unused in client init). |
| `@auth/prisma-adapter` | 2.11.1 | NextAuth adapter. |
| `next-auth` | 5.0.0-beta.30 | Auth. |
| `bcryptjs` | 3.0.3 | Credentials hashing. |
| `googleapis` | 171.4.0 | Gmail API send (emails + PDF). |
| `@playwright/test` | 1.58.2 | e2e only. |
| `qrcode` | 1.5.4 | UPI payment QR. |
| `jspdf`, `jspdf-autotable`, `html2canvas` | — | PDF generation (client-side). |
| `jimp` | 1.6.0 | Image processing (OCR path). |
| `jsqr` | 1.4.0 | QR decoding (`/api/settings/payment-qr/decode`). |
| `cloudinary` | 2.9.0 | Image uploads. |
| `fast-xml-parser`, `js-yaml`, `yaml` | — | Tally/YAML imports. |
| `sarvamai` | 1.1.4 | Sarvam TTS/vision (scripts only, not in app). |
| `recharts` | 3.7.0 | Dashboard charts. |
| `sonner` | 2.0.7 | Toasts. |
| `lucide-react`, `motion`, `radix-ui` + shadcn primitives | — | UI. |
| `dotenv` | 17.3.1 | Script env loading. |

**Notable absences:** no Razorpay SDK, no `openai`/`@langchain/*`/`ml` libs,
no queue lib (bullmq/redis), no validation lib (zod), no unit-test framework.

## Node tooling

- `tsconfig.json`: strict, `@/*` → repo root, bundler resolution, `allowJs`.
- `eslint.config.mjs`: ESLint 9 flat config (next/core-web-vitals style).
- `playwright.config.ts`: e2e config.
- `pnpm-workspace.yaml` + `pnpm-lock.yaml`: single-workspace pnpm.

## Environment variables (.env keys present)

- **DB:** `DATABASE_URL`, `DIRECT_URL`
- **Auth:** `AUTH_SECRET`, `NEXTAUTH_SECRET`
- **Google/Gmail:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ACCESS_TOKEN`, `GOOGLE_REFRESH_TOKEN`
- **Stripe:** `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- **App:** `APP_URL`, `NEXT_PUBLIC_APP_URL`, `SITE_URL`
- **Cron:** `CRON_SECRET`, `REMINDER_CRON_SECRET`
- **Cloudinary:** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- **OCR:** `OCR_SPACE_API_KEY`
- **Voice/Sarvam:** `SARVAM_API_KEY`, `VAPI_API_KEY`, `VAPI_PHONE_NUMBER_ID`, `VAPI_ASSISTANT_ID` (VAPI commented out in README)
- **LLM:** `LLAMAINDEX_API_KEY` (present, unused)
- **Twilio (SMS):** not present as keys in `.env` — SMS is disabled by design.

## npm scripts

```bash
pnpm dev                 # next dev --webpack -H 0.0.0.0
pnpm build               # prisma generate && next build
pnpm start
pnpm lint                # eslint
pnpm test:e2e            # playwright test
pnpm check-db            # tsx scripts/maintenance/check-db.ts
pnpm db:clear            # tsx scripts/maintenance/clear-db.ts
pnpm reminders:run       # node --env-file=.env scripts/automation/run-reminders.js
pnpm integration:sarvam:voice|vision
```

## Automation / scheduling

- README references a Vercel cron `30 13 * * *` (7 PM IST) → `/api/reminders/auto`,
  but **no `vercel.json` exists in the repo** — the cron is currently only driven
  by the local launcher below. Verify/add before relying on cloud scheduling.
- Local: Windows Task Scheduler → `scripts/automation/run-reminders.bat` → `.js` → POST target.
- GitHub Actions: `.github/workflows/ci.yml`, `.github/workflows/reminders.yml`.

## Guardrails for new dependencies

1. **Prefer no new heavy runtime deps for MVP.** Razorpay calls can use `fetch`
   with Basic auth (mirroring `lib/stripe.ts` pattern) — no SDK required.
2. If an LLM provider is needed, the existing `LLAMAINDEX_API_KEY` suggests
   LlamaIndex-compatible endpoints; confirm provider before adding a client lib.
3. For ML: keep training in Python (sklearn) with an exported model (`.pkl`/`.onnx`),
   and a thin TS wrapper in `lib/risk/`. Do NOT add Python ML deps to the Node
   runtime dependencies.
4. Add `zod` for request validation on new agent/webhook endpoints if desired —
   existing code uses manual validation; either convention is acceptable, stay consistent per-file.
5. Do not remove existing deps without checking `app/api/invoices/*` legacy
   fallbacks and `lib/pdf.ts`/`lib/gmail.ts` usages.
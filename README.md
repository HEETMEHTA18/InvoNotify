This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Automatic Invoice Reminders

This project supports automatic invoice reminder emails, including:

- Before due date: `7`, `3`, `1` day(s), and `on due date`
- Overdue reminders: every `N` days until invoice is paid
- Delivery channel: `Email`, `SMS`, or `Both`

### Configure in Invoice Form

In `Create Invoice` and `Edit Invoice`, enable **Automatic Email Reminders** and choose:

- reminder offsets before due date
- overdue repeat interval (days)

### Backend Endpoint (Cron)

Automatic reminders are sent by:

- `GET /api/reminders/auto`
- `POST /api/reminders/auto`

The endpoint is protected by:

- authenticated user session, or
- cron secret header (`Authorization: Bearer <CRON_SECRET>` or `x-cron-secret`)

### Environment Variables

Add one of these for production scheduler auth:

- `CRON_SECRET=your-long-random-secret`
- or `REMINDER_CRON_SECRET=your-long-random-secret`

Email sending uses existing SMTP/Gmail settings already configured in `.env`.

### Run Migration

After pulling code, run:

```bash
pnpm prisma migrate deploy
```

For local development:

```bash
pnpm prisma migrate dev
```

### Vercel Cron

`vercel.json` is configured to run reminders daily at `09:00 UTC`:

- `path`: `/api/reminders/auto`
- `schedule`: `0 9 * * *`

You can adjust this schedule in `vercel.json`.

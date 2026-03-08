# 📄 InvoiceFlow - Advanced B2B Invoice Management

A professional, full-stack invoice management system built for modern businesses to streamline their billing workflow, automate client reminders, and track payments in real-time.

---

## ✨ Key Features

- **Professional Invoicing**: Create, preview, and send PDF invoices with custom logos and digital signatures.
- **🤖 Automated Reminders**: Fully automated engine for sending Email (Gmail/SMTP) and SMS (Twilio) reminders.
- **Smart Templates**: Dynamic receipt-style email templates that change design for upcoming vs. overdue payments.
- **Bulk Import**: Seamlessly import customers and invoices using YAML/Tally data.
- **Analytics Dashboard**: Real-time stats on revenue, pending payments, and customer activity.
- **Multi-Channel**: Supports Email, SMS, and Telegram notifications.
- **Local & Cloud Ready**: Optimized for Vercel deployment or local Intranet use.

---

## 🛠 Tech Stack

- **Framework**: [Next.js 15 (App Router)](https://nextjs.org/)
- **Database**: [Prisma ORM](https://www.prisma.io/) with PostgreSQL (Neon)
- **Authentication**: [NextAuth.js v5](https://authjs.dev/) (Google & Credentials)
- **Styling**: Tailwind CSS & Shadcn UI
- **Notifications**: Nodemailer, Gmail API, Twilio (SMS), Telegram Bot API
- **Utilities**: jsPDF (PDF export), Recharts (Analytics)

---

## 📁 Project Structure

```bash
├── app/              # Next.js Pages and API Routes
├── components/       # Visual UI Components (Shadcn + Reusable)
├── lib/              # Core Logic (Database, Auth, Mail Service, PDF)
├── data/             # Bulk Import Templates (YAML)
├── prisma/           # Database Schema & Migrations
├── scripts/          # Automation Task Launchers (Cron/Scheduler)
├── public/           # Static Assets (Logos, Icons)
└── Documentation/    # Project SRS, PPTX, and PDF manual records
```

---

## 🚀 Setup & Installation

### 1. Requirements
- Node.js 18.17+ 
- PostgreSQL Database

### 2. Environment Configuration
Create a `.env` file in the root:
```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

# Auth
AUTH_SECRET="your-secret"
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# Mail & Notifications
GMAIL_USER="your-email@gmail.com"
GMAIL_APP_PASSWORD="..."
TWILIO_ACCOUNT_SID="..."
TWILIO_AUTH_TOKEN="..."

# Automation
REMINDER_CRON_SECRET="ims_cron_secure_reminder_9918"
SITE_URL="http://localhost:3000"
```

### 3. Initialize Project
```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

---

## 🤖 Automation (Reminder System)

### Local Server (Windows)
The system includes a pre-configured **Windows Task Scheduler** integration.
- **Task Launcher**: `scripts\run-reminders.bat`
- **Schedule**: Triggers daily at 09:00 AM.
- **Logs**: History is stored in `logs\reminder-cron.log`.

### Cloud (Vercel)
The project is configured with `vercel.json` for automatic Cron Job execution. Ensure the `REMINDER_CRON_SECRET` is set in your Vercel project environment variables.

---

## 📄 License
Project developed for B2B Invoice Management. All rights reserved.

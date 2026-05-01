# System Specification Report

## 1. Title
InvoiceFlow - B2B Invoice Management, Customer Risk Tracking, and Reminder Automation

## 2. Project Summary
InvoiceFlow is a full-stack business application built for companies that manage customers, generate invoices, track payments, and send automated reminders. The system is designed around a single web application architecture using Next.js for both the frontend and API layer, Prisma for database access, and PostgreSQL for persistent storage.

The repository already contains a complete end-to-end flow:
- user authentication
- customer creation and import
- invoice creation and import
- payment and balance tracking
- automatic reminder processing
- dashboard analytics and risk scoring

## 3. Business Use Case
The system is especially suitable for a hardware company that sells to retailers, contractors, builders, and distributors on credit. In this workflow:
- the sales team creates customer records
- the accounts team imports or creates invoices
- the system tracks due dates and balances
- reminders are sent automatically before or after due dates
- management monitors overdue exposure and customer risk

## 4. System Objectives
The project aims to:
1. Reduce manual follow-up for unpaid invoices.
2. Maintain a structured customer and invoice ledger.
3. Improve payment collection through scheduled reminders.
4. Support bulk data import for operational efficiency.
5. Provide dashboard visibility into business health and credit exposure.

## 5. Architecture Overview
### 5.1 Frontend Layer
The UI is built using Next.js App Router pages and reusable React components. It includes:
- login and register pages
- dashboard pages
- invoice and customer views
- documentation and landing pages

### 5.2 API Layer
Backend logic is implemented through route handlers under `app/api/**/route.ts`. These handlers support:
- authentication
- customer CRUD and bulk import
- invoice CRUD and bulk import
- reminder dispatch
- dashboard metrics
- OCR, uploads, payments, and settings

### 5.3 Database Layer
Prisma manages PostgreSQL interaction. The database stores:
- users
- customers
- invoices
- invoice line items
- reminder logs
- company settings

### 5.4 Automation Layer
Automated reminder execution is triggered through:
- `/api/reminders/auto`
- Vercel Cron
- local scheduler scripts for development or hosting environments

## 6. End-to-End Workflow
### 6.1 Authentication
Users sign in through NextAuth using credentials or Google OAuth. Protected routes verify session state using `auth()`.

### 6.2 Customer Management
Customers can be created manually or imported from YAML/JSON files. The customer import path normalizes:
- name
- email
- phone
- address
- opening balance
- GSTIN
- CIBIL score

### 6.3 Invoice Management
Invoices can be created manually or imported in bulk. The system supports:
- customer name and email matching
- stock item line entries
- GST allocation entries
- due dates
- reminder settings
- payment status and balance tracking

### 6.4 Reminder Handling
The reminder engine checks invoice due dates and sends emails or other configured notifications. Duplicate sends are prevented by reminder logs and reminder keys.

### 6.5 Dashboard Reporting
The dashboard compiles customer risk, overdue counts, and outstanding totals so management can act on accounts that require collection follow-up.

## 7. Data Fixtures Added for Hardware Demos
The repository includes hardware-specific YAML fixtures in the `data/` folder:
- `data/hardware_customers.yml`
- `data/hardware_transactions.yml`
- `data/hardware_end_to_end.yml`
- `data/hardware_bulk_demo.yml`

These fixtures use the requested customer emails:
- `heetmehta18125@gmail.com`
- `ommistry5559@gmail.com`
- `heetpersonal1812@gmail.com`

They are useful for:
- bulk import testing
- presentation demos
- end-to-end system walkthroughs
- showing customer/invoice linking

## 8. Important Modules
- `app/api/customers/bulk-import/route.ts`
- `app/api/invoices/bulk-import/route.ts`
- `app/api/reminders/auto/route.ts`
- `app/api/customers/route.ts`
- `app/api/invoices/route.ts`
- `lib/customer-credit.ts`
- `lib/reminders.ts`
- `lib/mail-service.ts`
- `lib/customer-schema.ts`

## 9. Validation and Security Observations
The login and registration forms now include stronger checks:
- email format validation
- password length validation
- password complexity validation
- password visibility toggle for usability

Server-side actions also reject weak or incomplete input before account creation or login attempts proceed.

## 10. Technical Strengths
1. Single repository full-stack architecture.
2. Clear user-scoped data handling.
3. Bulk import support for operational efficiency.
4. Automated reminder system with duplicate prevention.
5. Risk scoring and dashboard analytics for business control.

## 11. Limitations and Assumptions
1. Bulk imports depend on the input structure matching the accepted schema.
2. Reminder delivery depends on valid environment variables and provider configuration.
3. Some workflows rely on existing schema columns and migrations being present.

## 12. Likely Viva or Presentation Questions
### Project and Architecture
1. What problem does the system solve?
2. Why was Next.js used for both frontend and backend?
3. Why is Prisma suitable for this project?
4. Why did you choose PostgreSQL?
5. How does the app remain single-user safe in a multi-user environment?

### Database and Data Flow
6. How are customers linked to invoices?
7. How is customer risk calculated?
8. What is the purpose of `cibilScore`?
9. How are overdue invoices detected?
10. How does the system prevent duplicate reminder sends?

### Import and Parsing
11. What file formats can the system import?
12. How are YAML imports converted into database records?
13. How are inventory items handled?
14. How are GST lines stored or computed?
15. How does the system match invoices to customers?

### Reminder Logic
16. When does the system send a reminder?
17. What is the difference between pre-due and overdue reminders?
18. What happens if the same reminder is triggered twice?
19. Which channels are supported?
20. How does cron security work?

### Coding and Implementation
21. Why do some route handlers include fallback paths?
22. Why are both `ownerUserId` and `userId` supported in some places?
23. How do validation checks improve reliability?
24. Why is password visibility important in the UI?
25. Where would you add tests for import and auth flows?

## 13. Presentation Demo Sequence
1. Show the login and register screens with validation and password visibility.
2. Import the hardware customer file.
3. Import the bulk hardware invoice file.
4. Open the dashboard and explain customer risk and outstanding balances.
5. Show the reminder settings and describe the automation flow.

## 14. Conclusion
InvoiceFlow provides a practical business solution for companies that require invoice tracking, customer management, and reminder automation. The added hardware demo datasets and strengthened authentication screens make the system more suitable for demonstrations, student presentations, and guided reviews.

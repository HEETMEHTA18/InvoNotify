SOFTWARE REQUIREMENTS SPECIFICATION
for
INVOICE MANAGEMENT SYSTEM

Version 1.0 Approved
Prepared by: 20CS045, 20CS046, 20CS050, 20CS051
CSPIT-CSE
Date: February 24, 2026

---------------------------------------------------------------------------

TABLE OF CONTENTS

1. Introduction
   1.1 Objective
   1.2 Document Conventions
   1.3 Intended Audience and Reading Suggestions
   1.4 Project Scope
   1.5 References
2. Overall Description
   2.1 Product Perspective
   2.2 Product Features
   2.3 User Classes and Characteristics
   2.4 Operating Environment
   2.5 Design and Implementation Constraints
   2.6 User Documentation
   2.7 Assumptions and Dependencies
3. System Features
   3.1 Automatic Invoice Reminders
4. External Interface Requirements
   4.1 User Interfaces
   4.2 Hardware Interfaces
   4.3 Software Interfaces
   4.4 Communications Interfaces
5. Other Nonfunctional Requirements
   5.1 Performance Requirements
   5.2 Safety Requirements
   5.3 Security Requirements
   5.4 Software Quality Attributes
6. Other Requirements
Appendix A: Glossary
Appendix B: Analysis Models
Appendix C: Issues List

---------------------------------------------------------------------------

1. INTRODUCTION

1.1 Objective
The objective of this project is to design an Invoice Management System (IMS) that helps businesses and freelancers streamline their billing processes. The primary goal is to provide a centralized, automated platform to create, send, and track client invoices, ensuring efficient financial management from anywhere.

1.2 Document Conventions
This document uses standard business documentation formatting. Technical terms like Next.js, Prisma, and Vercel Cron refer to the specific technologies implemented in the system. High-priority items are capitalized for emphasis.

1.3 Intended Audience and Reading Suggestions
The intended audience includes business owners, accountants, and administrative staff who generate bills and track revenue. Developers and project managers should use this document to understand the project's technical and functional scope.

1.4 Project Scope
The Invoice Management System provides a comprehensive tool for digital billing cycles. It eliminates manual paperwork by allowing users to oversee revenue, manage client accounts, generate secure invoices, and track payment statuses (Paid, Unpaid, Overdue) through an intuitive web interface.

1.5 References
- Project repository: e:\Heet\B2B
- Next.js Documentation (nextjs.org)
- Prisma ORM Documentation (prisma.io)
- Vercel Deployment and Cron Guides (vercel.com)

---------------------------------------------------------------------------

2. OVERALL DESCRIPTION

2.1 Product Perspective
As a web-based application, the Invoice Management System provides:
- Invoice Generation: Customizable invoices with tax calculations (GST/CGST/SGST/IGST).
- Payment Tracking: Monitoring of billing lifecycles and revenue collection.
- Automated Reminders: Systematic notification system for pending and overdue payments.

2.2 Product Features
- Secure User Authentication via NextAuth.js.
- Financial Dashboard with real-time analytics.
- Multi-template Invoice Creation (Standard, Professional).
- Automated Email and SMS reminders.
- Recurring overdue alerts based on user-defined intervals.

2.3 User Classes and Characteristics
- Administrators/Owners: Full access to manage billing, configuration, and reports.
- Accountants: Access to draft invoices, verify payments, and manage client data.

2.4 Operating Environment
- Client: Windows, macOS, Linux (Accessible via modern browsers like Chrome).
- Server/Hosting: Vercel Platform.
- Framework: Next.js (TypeScript-based).
- Database: Prisma ORM with PostgreSQL.

2.5 Design and Implementation Constraints
- Deployment: Optimized specifically for the Vercel Platform.
- Scheduling: Automated tasks run via Vercel Cron daily at 09:00 UTC.
- Security: Sensitive API endpoints are protected via CRON_SECRET headers.
- Data Integrity: Managed strictly through Prisma database migrations.

2.6 User Documentation
The project includes a README.md file for installation and environment setup. The web interface features intuitive guides for configuring automated reminders.

2.7 Assumptions and Dependencies
- Dependent on valid SMTP/Gmail credentials for email dispatch.
- Dependent on Twilio or similar gateways for SMS notifications.
- Reliant on Vercel infrastructure for hosting and task scheduling.

---------------------------------------------------------------------------

3. SYSTEM FEATURES

3.1 Automatic Invoice Reminders
3.1.1 Description: Sends automated alerts via Email or SMS before/on the due date and at recurring intervals if overdue.
3.1.2 Functional Requirements:
- Users can toggle reminders on/off per invoice.
- Choice of delivery channel: Email, SMS, or Both.
- Customizable offsets (7, 3, or 1 day before due date).
- Recurring overdue alerts (e.g., every 3 days).

---------------------------------------------------------------------------

4. EXTERNAL INTERFACE REQUIREMENTS

4.1 User Interfaces
- Responsive front-end built with Next.js and Tailwind CSS.
- Optimized typography using the Geist font family for readability.
- Visual data representation using Recharts.

4.2 Hardware Interfaces
- Accessible from any computer or mobile device with a modern web browser and internet connection.

4.3 Software Interfaces
The following table summarizes the core technologies used:

Software Used                | Description
-----------------------------|--------------------------------------------------
OS & Hosting                 | Vercel Platform (Production) / Multi-OS (Dev)
Database                     | Prisma ORM with PostgreSQL
Framework                    | Next.js (TypeScript 98.9% efficiency)
Notification Interface       | SMTP/Gmail for Email; Twilio for SMS
Task Scheduler               | Vercel Cron (Daily at 09:00 UTC)

4.4 Communications Interfaces
- HTTPS for secure web communication.
- SMTP for outbound email delivery.
- RESTful APIs for internal and external service integration.

---------------------------------------------------------------------------

5. OTHER NONFUNCTIONAL REQUIREMENTS

5.1 Performance Requirements
- High responsiveness and low latency for all financial operations.
- Efficient processing of bulk reminders during the morning cron window.

5.2 Safety Requirements
- Prevention of accidental spam through strict reminder logic.
- Protection of sensitive billing data from unauthorized external access.

5.3 Security Requirements
- Strict endpoint protection using CRON_SECRET environment variables.
- Secure session management preventing unauthorized dashboard access.

5.4 Software Quality Attributes
- Availability: Guaranteed 24/7 access via Vercel's global infrastructure.
- Correctness: High precision in GST calculations and schedule adherence.
- Maintainability: Robust TypeScript codebase with automated migrations.

---------------------------------------------------------------------------

6. OTHER REQUIREMENTS
- Database migrations must be executed via 'pnpm prisma migrate deploy'.
- Proper environment variable configuration is mandatory for all production features.

---------------------------------------------------------------------------

APPENDIX A: GLOSSARY
- Prisma: Object-Relational Mapper (ORM) for secure database access.
- Vercel Cron: Scheduler for automated background tasks.
- Next.js: Core framework for UI and API routes.
- TypeScript: Language used for type-safe code implementation.

APPENDIX B: ANALYSIS MODELS
- Data Flow: User creates invoice -> Data persists in PostgreSQL -> Cron triggers dispatch -> Notification sent via SMTP.

APPENDIX C: ISSUES LIST
- Integration of regional SMS providers.
- Future support for direct one-click payment links (Stripe/Razorpay).

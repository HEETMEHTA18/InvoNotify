---
name: Customer Module Builder
description: "Implement a complete customer module in this Next.js app with sidebar navigation, import, history tracking, CIBIL score, risk segmentation, and PDF export"
argument-hint: "Optional: customer fields, import format, CIBIL/risk thresholds, and PDF layout preferences"
agent: agent
---
Build or update a full customer module in this repository based on the request below.

Request details:
- Add a Customer module accessible from the app sidebar/dashboard navigation.
- Show customer records in the customer section with search/filter/sort and pagination where needed.
- Support customer import (CSV or Excel). Validate rows and show import summary (success, skipped, failed with reason).
- Store and display CIBIL score for each customer in their customer profile page when opened/clicked.
- Show a top overview section with properly formatted risky customers and good customers lists/cards side by side.
- Track customer history and activity timeline (what happened in the past, by whom, and when).
- Add PDF export for customer list and full customer history with the shop.
- Ensure the solution fits existing project patterns (App Router, Prisma schema, API routes, UI components, auth rules).

Implementation requirements:
1. Discover existing patterns for dashboard modules, API handlers, Prisma models, and PDF generation.
2. Add or update data models for customers and customer history/events with proper relations and indexes.
   - Include CIBIL score fields and any fields needed for customer risk classification.
3. Create migration-safe server logic and APIs for:
   - CRUD customers
   - import customers
   - customer history retrieval
   - risk segmentation summary (risky vs good customers)
   - PDF export endpoint
4. Add UI pages/components in dashboard for:
   - top summary section with side by side risky customers and good customers views
   - customer list
   - import flow
   - customer details with timeline/history and CIBIL score details
   - export actions
5. Wire customer entry in sidebar navigation and route guards consistent with current app.
6. Reuse existing utilities where possible (auth, db, pdf, templates, validation).
7. Add tests for critical paths (import parser/validator, history recording, PDF export endpoint).
8. Run lint/type checks and report results.

Output format:
1. Summary of what was implemented.
2. Files changed and why.
3. Migration notes (schema changes and commands).
4. Validation results (lint, typecheck, tests).
5. Follow-up recommendations.

If any requirement is ambiguous, make the smallest safe assumption and document it in the final summary.
Use sensible default risk bands if not provided (for example: risky below threshold, good at or above threshold) and state the chosen thresholds in the output.
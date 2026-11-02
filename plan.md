I'd approach this as a small product, not just a spreadsheet with a voice shortcut.

The objective is to build a private, local-first personal finance application that works on your iPhone and Mac, supports Siri expense entry, and doesn't require App Store distribution or a paid Apple Developer membership.

I'd give Claude Code a phased implementation plan, with explicit architectural constraints so it doesn't overengineer the project.

One important architectural rule: Vercel authentication protects access to the hosted website, but it doesn't automatically protect every API endpoint or provide private data synchronisation. We'll treat website access, data encryption and device synchronisation as separate concerns.

## Build plan for Claude Code

I've written this as an implementation brief you can paste directly into Claude Code.

# Project: Personal Expense Tracker

## 1. Objective

Build a private, personal expense-tracking application that works on iPhone and Mac.

The application should allow me to:

- Record expenses manually.
- Record expenses through Siri using natural language.
- Automatically categorise transactions.
- Track income, expenses and transfers.
- Review monthly and yearly spending.
- View account balances and spending breakdowns.
- Synchronise data between my iPhone and Mac.
- Export all financial data.

This is a personal application. It will not be published on the App Store or made publicly accessible.

## 2. Core principles

1. Privacy first: financial records must not be publicly accessible.
2. Local-first: the application should remain usable without an internet connection.
3. Minimal infrastructure: avoid unnecessary backend services.
4. No third-party financial integrations or bank connections.
5. No unnecessary analytics or tracking.
6. No mandatory subscription services.
7. Data portability: I must be able to export all my records.
8. Simplicity: prioritise reliable expense entry over excessive features.

## 3. Technology stack

Use the following as the initial proposed stack:

| Component          | Technology            |
| ------------------ | --------------------- |
| Frontend           | React + TypeScript    |
| Build tool         | Vite                  |
| UI                 | Tailwind CSS          |
| Application format | Progressive Web App   |
| Local database     | IndexedDB using Dexie |
| Hosting            | Vercel                |
| Deployment access  | Vercel Authentication |
| Charts             | Recharts              |
| Voice input        | Apple Shortcuts       |
| Data encryption    | Web Crypto API        |
| Backend            | Avoid initially       |

Use current stable versions and keep dependencies minimal.

Do not introduce a backend, authentication framework, ORM or complex state-management library without a clear requirement.

## 4. Application architecture

### Frontend

Build a responsive PWA optimised for:

- iPhone portrait screens.
- Mac desktop screens.
- Tablet screens.

It should be installable on the iPhone Home Screen and usable in Safari.

The frontend should have offline functionality.

### Hosting and access control

Deploy the application through Vercel.

Configure Vercel Deployment Protection:

- Enable Vercel Authentication.
- Set protection scope to All Deployments.
- Restrict access to my authorised Vercel account.
- Protect production and preview deployments.

Do not implement public user registration.

Do not assume deployment protection automatically secures every API or external storage resource. Verify access control independently for each endpoint.

### Data storage

Use IndexedDB for local transaction storage.

Requirements:

- Persistent local storage.
- Versioned database schema.
- Database migrations.
- Transaction validation.
- Unique transaction IDs.
- Reliable handling of concurrent changes.

Use Web Crypto API for sensitive data encryption where appropriate.

Never store encryption keys in frontend source code or Vercel environment variables exposed to the client.

### Synchronisation

iPhone and Mac have separate browser storage. Implementing synchronisation is a separate requirement.

Initially, support:

- JSON export.
- JSON import.
- Backup and restore.
- Duplicate detection using transaction IDs.

Design the data layer so encrypted cross-device synchronisation can be introduced later.

Do not synchronise by simply sharing a SQLite or IndexedDB database file.

Before implementing automatic sync, propose a secure architecture and explain its threat model.

## 5. Data model

Create the following entities.

### Transaction

- id
- type: expense | income | transfer
- amount
- currency (default INR)
- description
- merchant
- categoryId
- accountId
- date
- paymentMethod
- notes
- createdAt
- updatedAt

### Category

- id
- name
- type
- icon
- color

Initial categories:

Expenses:

- Food & Dining
- Groceries
- Transport
- Fuel
- Shopping
- Entertainment
- Health
- Fitness
- Travel
- Bills & Utilities
- Rent
- Subscriptions
- Education
- Personal Care
- Miscellaneous

Income:

- Salary
- Freelance
- Investments
- Refunds
- Other Income

Categories must be editable.

### Account

- id
- name
- type
- openingBalance
- currency
- createdAt

Initial account examples:

- Cash
- HDFC Bank
- Other Bank
- Credit Card
- UPI

### Transfer

Transfers between accounts must not be counted as income or expenses.

Ensure account balances are calculated correctly.

## 6. Core screens

### A. Dashboard

Display:

- Total spending this month.
- Total income this month.
- Remaining balance.
- Spending by category.
- Recent transactions.
- Monthly spending trend.

Include a month selector.

### B. Transactions

Features:

- List all transactions.
- Search by description or merchant.
- Filter by category.
- Filter by account.
- Filter by date.
- Edit and delete transactions.
- Sort by date and amount.

### C. Add transaction

Provide a simple form.

Fields:

- Transaction type.
- Amount.
- Description.
- Category.
- Account.
- Date.
- Notes.

Use sensible defaults to minimise manual input.

### D. Analytics

Display:

- Monthly spending trends.
- Category breakdown.
- Income versus expenses.
- Account-wise balances.
- Month-over-month comparisons.
- Highest spending categories.

All calculations must be based on actual transactions.

### E. Settings

Include:

- Manage categories.
- Manage accounts.
- Currency selection.
- Export data.
- Import data.
- Backup and restore.
- Privacy information.

## 7. Voice expense logging

Voice logging is a major feature, not an optional enhancement.

The desired experience:

"Hey Siri, log an expense."

Then:

"Spent 350 rupees on lunch using HDFC."

The system should extract:

{\
"type": "expense",\
"amount": 350,\
"currency": "INR",\
"description": "Lunch",\
"category": "Food & Dining",\
"account": "HDFC Bank"\
}

### Siri integration

Use Apple Shortcuts initially.

The shortcut should:

1. Capture dictated text.
2. Parse the expense.
3. Validate the extracted information.
4. Ask for confirmation if necessary.
5. Submit the transaction.
6. Confirm successful recording through Siri.

Support natural-language variations:

- Spent 350 on lunch.
- Paid 1200 for petrol using HDFC.
- Bought groceries for 850 yesterday.
- Received 5000 from freelance work.
- Transferred 10000 from HDFC to cash.

### Important technical constraint

A Shortcut cannot automatically access the PWA's IndexedDB.

Do not solve this by placing transaction details in URL query parameters or by exposing an unauthenticated API.

Investigate the most appropriate private ingestion mechanism for Siri Shortcuts.

Compare:

- A private API with device-specific authentication.
- Client-side encrypted ingestion.
- An iCloud Drive-based transaction queue.

Explain the security and synchronisation trade-offs before implementing this feature.

The final implementation must not silently send unencrypted financial information to a third-party service.

### Parser

Initially implement deterministic parsing for:

- Amount.
- Currency.
- Description.
- Category.
- Account.
- Date.
- Transaction type.

Use editable category and account mappings.

Do not introduce an external LLM API just to parse expenses.

## 8. Security requirements

- No public registration.
- No publicly accessible financial database.
- No hardcoded credentials.
- No secrets in frontend environment variables.
- No unnecessary analytics.
- No third-party advertising or tracking.
- Validate all incoming transactions.
- Validate all imported JSON.
- Protect backup files.
- Provide complete data deletion and export functionality.
- Document the privacy implications of any external service.

Treat Vercel authentication as website access protection, not as the sole security mechanism for financial data.

## 9. Development phases

### Phase 0: Architecture and planning

Before writing implementation code:

- Inspect the repository.
- Confirm existing tooling and conventions.
- Propose the application architecture.
- Identify technical limitations of iOS PWAs and Shortcuts.
- Resolve the Siri ingestion and cross-device synchronisation designs.
- Document security assumptions.

Do not start by generating the entire application.

### Phase 1: Core application

Implement:

- PWA setup.
- Responsive layout.
- IndexedDB.
- Database schema and migrations.
- Transaction CRUD.
- Categories.
- Accounts.
- Dashboard.

### Phase 2: Financial functionality

Implement:

- Income and expenses.
- Transfers.
- Balance calculations.
- Search and filtering.
- Monthly analytics.
- Category breakdowns.

### Phase 3: Voice integration

Implement:

- Apple Shortcut.
- Dictation.
- Natural-language parser.
- Validation.
- Transaction submission.
- Siri confirmation.

Test actual Siri execution on an iPhone.

### Phase 4: Data portability and security

Implement:

- JSON export/import.
- Backup and restore.
- Encryption.
- Data validation.
- Access-control verification.
- Offline functionality.

### Phase 5: Cross-device synchronisation

Implement the selected private synchronisation architecture.

Test:

- iPhone to Mac.
- Mac to iPhone.
- Duplicate prevention.
- Simultaneous edits.
- Offline changes.
- Conflict resolution.

### Phase 6: Deployment

Deploy to Vercel.

Configure:

- Production deployment.
- Vercel Authentication.
- All Deployments protection.
- Environment variables, if any.
- PWA manifest and icons.
- HTTPS.

Verify that unauthorised users cannot access the application.

## 10. Quality requirements

- TypeScript strict mode.
- ESLint.
- Prettier.
- Automated tests for transaction calculations.
- Tests for transfers and account balances.
- Tests for parser accuracy.
- Tests for import/export.
- Tests for duplicate transactions.
- No silent data loss.
- Clear error handling.

Maintain a clean separation between UI, business logic and data access.

## 11. Design direction

I want a clean, minimal financial dashboard.

Design references:

- Apple Human Interface Guidelines.
- Linear.
- Modern personal finance dashboards.

Avoid:

- Excessive gradients.
- Unnecessary animations.
- Overloaded dashboards.
- Too many colours.
- Gamification.
- Decorative charts without useful information.

Use a restrained design system, excellent typography and clear financial data presentation.

## 12. Instructions for Claude Code

Work incrementally.

First, inspect the repository and produce:

1. Proposed architecture.
2. Folder structure.
3. Database schema.
4. Security model.
5. Siri integration proposal.
6. Synchronisation proposal.
7. Implementation milestones.

Wait for approval before implementing.

After approval, implement one phase at a time.

Do not make assumptions about iOS capabilities. Verify platform limitations and test the actual workflows.

Prioritise data integrity and privacy over convenience or premature feature development.

## A few decisions I'd make before giving Claude Code the go-ahead

There are three things I want to highlight.

1\. Vercel protection is now viable on the free plan.

Vercel announced on September 9, 2026 that Vercel Authentication can protect production deployments on every plan at no additional cost. Select All Deployments in Deployment Protection.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://vercel.com\&sz=32)

Vercel



2\. Siri is the technically tricky part.

Apple Shortcuts cannot directly write into your PWA's IndexedDB. We need to design a secure bridge rather than just build a shortcut that sends financial data to a public endpoint.

3\. Synchronisation should come after the core app.

I would not start by building a cloud backend. First make sure expense recording, calculations, categories and exports work correctly.

## Recommended development order

1. Build the expense tracker

   Manual entry, dashboard, categories, accounts and analytics.
2. Deploy privately

   Vercel + authentication + PWA installation.
3. Add Siri

   Voice capture and secure transaction ingestion.
4. Add Mac/iPhone sync

   Private encrypted synchronisation and conflict handling.
5. Polish and automate

   Backups, exports, recurring expenses and better analytics.

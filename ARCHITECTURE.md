# PocketLog — Architecture (Phase 0)

Single-user, local-first expense tracker for iPhone + Mac. Supersedes the open questions in `plan.md`; where the two disagree, this file wins.

## 1. Key decisions

| Decision         | Choice                                                                   | Why                                                                                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage          | IndexedDB (Dexie) on each device, **no backend**                         | Maximum privacy; data never leaves the device except in files you export.                                                                                                                                                                                 |
| Hosting          | Vercel, static files only                                                | PWA install on iPhone needs HTTPS. The site serves code, never data.                                                                                                                                                                                      |
| Login            | **None**                                                                 | No server holds data, so there is nothing to log in to. Anyone opening the URL gets their own empty local database. A client-side passcode would be theatre: data sits unencrypted in IndexedDB regardless; the device passcode/Face ID is the real lock. |
| Shortcut token   | **None**                                                                 | The Shortcut writes to a local file, not to a server.                                                                                                                                                                                                     |
| Siri             | Shortcut appends dictated text to an inbox file; app imports + parses it | Shortcuts cannot reach the PWA's IndexedDB. See §7.                                                                                                                                                                                                       |
| iPhone ↔ Mac     | Manual sync via export/import file with merge                            | No server = no automatic sync. Merge is by ID + `updatedAt`, so repeated syncs are safe.                                                                                                                                                                  |
| Money            | Integers in paise                                                        | No floating-point drift.                                                                                                                                                                                                                                  |
| Currency         | INR only (field kept for future)                                         | Single user, single currency.                                                                                                                                                                                                                             |
| Local encryption | Not for IndexedDB; optional passphrase for backup files                  | Key would have to live next to the data in the browser. Backups are what leave the device, so that's where encryption matters.                                                                                                                            |

## 2. Stack

React + TypeScript (strict) · Vite · Tailwind CSS · `vite-plugin-pwa` (Workbox service worker, manifest) · Dexie + `dexie-react-hooks` (`useLiveQuery` gives reactive queries, so no state library) · hand-drawn SVG charts (one small column chart didn't justify ~100 KB of Recharts) · Zod (validation of form input and imported JSON) · `wouter` (tiny router) · Vitest · oxlint (the current Vite template default, replacing ESLint) · Prettier.

No date library — dates are stored as local `YYYY-MM-DD` strings and handled with small helpers + `Intl`. IDs via `crypto.randomUUID()`.

## 3. Folder structure

```
src/
  app/            App shell, routes, layout, bottom tab bar / sidebar
  features/
    dashboard/
    transactions/ list, filters, add/edit form
    analytics/
    inbox/        Siri inbox import + review queue
    settings/     categories, accounts, backup, privacy, delete-all
  components/     UI primitives (Button, Sheet, Field, AmountInput, …)
  domain/         Pure logic, no React/Dexie: types, money, balances, analytics, validation
  parser/         Natural-language parser (pure, heavily tested)
  data/           Dexie schema + migrations, repositories, seed data
    backup/       export, import, merge, crypto
  lib/            ids, date helpers, formatting
```

Rule: `domain/` and `parser/` import nothing from `data/`, `features/` or React. UI → repositories → Dexie.

## 4. Data model (Dexie schema v1)

All entities carry `createdAt`, `updatedAt` (ISO timestamps) and `deletedAt?` (soft delete — needed so deletions survive merge-sync). Lists hide soft-deleted rows; "Delete all data" hard-wipes.

**Transaction**

```ts
{
  id: string;                 // uuid
  type: 'expense' | 'income' | 'transfer';
  amount: number;             // paise, positive integer
  currency: 'INR';
  description: string;
  merchant?: string;
  categoryId?: string;        // required for expense/income, absent for transfer
  accountId: string;          // source account (expense/transfer) or destination (income)
  toAccountId?: string;       // transfer only, must differ from accountId
  date: string;               // 'YYYY-MM-DD', local
  paymentMethod?: 'upi' | 'card' | 'cash' | 'netbanking' | 'other';
  notes?: string;
  source: 'manual' | 'siri' | 'import';
  needsReview: boolean;       // low-confidence parses land here
  createdAt; updatedAt; deletedAt?;
}
```

**Category** `{ id, name, type: 'expense'|'income', icon, color, keywords: string[], archived, … }` — `keywords` drive the parser ("lunch", "swiggy", "zomato" → Food & Dining). Editable in Settings.

**Account** `{ id, name, type: 'cash'|'bank'|'credit_card'|'wallet', openingBalance (paise, may be negative), currency, aliases: string[], isDefault, archived, … }` — `aliases` drive the parser ("hdfc", "hdfc bank").

**InboxEntry** `{ key (hash of raw line), rawText, recordedAt, status: 'imported'|'skipped', transactionId? }` — dedupes Siri inbox imports.

**Meta** `{ key, value }` — `lastBackupAt`, `lastSyncAt`, device name.

Indexes: `transactions: id, date, type, categoryId, accountId, toAccountId, updatedAt`.

Categories/accounts referenced by transactions are **archived**, not deleted.

Seed: the categories and accounts from `plan.md`, except **UPI becomes a payment method**, not an account (UPI moves money out of a bank account; it doesn't hold any).

## 5. Financial rules

- **Account balance** = opening + income into it − expenses from it − transfers out + transfers in.
- **Transfers** never count as income or expense in any total or chart.
- **Credit card**: balance goes negative as you spend (amount owed). Paying the bill = transfer from bank → card.
- **Cash withdrawal**: transfer bank → Cash.
- **Dashboard "remaining"** = this month's income − this month's expenses (net). Total across account balances shown separately.
- All aggregates computed from transactions on read; no stored running totals (no drift).

## 6. Security & threat model

What we protect: the transaction history on your devices and in exported files.

| Threat                            | Mitigation                                                                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Someone opens the website         | Site contains only code. Their browser has its own empty DB.                                                                                                                                            |
| Lost/stolen device                | iOS/macOS passcode + device encryption.                                                                                                                                                                 |
| Malicious code shipped to the app | You control the repo and deploys; minimal deps; no runtime third-party scripts; strict CSP (`default-src 'self'`); no analytics.                                                                        |
| iOS clears browser storage        | `navigator.storage.persist()`; installed Home Screen apps are exempt from Safari's 7-day eviction; **backup reminder** on the dashboard when last backup > 7 days; one-tap backup to Files.             |
| Backup / sync file leaks          | Optional passphrase encryption (AES-GCM, key derived with PBKDF2 via Web Crypto). Files in iCloud Drive are readable by Apple unless Advanced Data Protection is on — documented on the Privacy screen. |
| Siri dictation                    | Processed by Apple (on-device for supported languages). Inbox file stored in **On My iPhone** by default, not iCloud.                                                                                   |
| Bad imported data                 | Every import validated with Zod; invalid rows reported, never silently dropped. Import is a merge preview before anything is written.                                                                   |

Vercel: default Standard Protection covers preview deployments. Production is public but holds no data. No environment variables or secrets exist.

## 7. Siri design

**Constraint:** a Shortcut cannot write to the PWA's IndexedDB, and Home Screen web apps have storage separate from Safari, so opening a URL can't reach it either.

**Flow (as built):**

1. "Hey Siri, log expense" → runs the _Log expense_ Shortcut (setup steps are on the app's Siri inbox screen).
2. The Shortcut dictates text and appends one line to `PocketLog/inbox.txt` in the Shortcuts folder of iCloud Drive: `2026-11-02T13:45:10+05:30 Spent 350 on lunch using HDFC`. Timestamp, a space, the dictated text; a space is easier to type in Shortcuts than a tab.
3. Siri reads back "Saved: …". No confirmation dialog; review happens in the app.
4. In the app: Siri inbox → **Import inbox file** → pick `inbox.txt`. Each line is parsed with the same parser as the Add form's quick-entry box, with the line's date as "today" for relative dates.
5. Every line is remembered by its SHA-256 hash, so re-importing the same growing file only adds new lines. The transaction id is derived from that hash (`siri-<hash>`), so a line imported on both iPhone and Mac merges as one record in Phase 4.
6. Confident parses are saved. Uncertain ones (guessed category, several amounts) are saved with `needsReview` and listed under **To review**. Lines without an amount or transfer accounts are kept under **Couldn't understand**, with **Add manually** (prefills the form) or **Dismiss**.
7. Clearing the file is manual (delete it in Files); PocketLog already remembers what it imported, so no second Shortcut is needed.

The same Shortcut works on the Mac, and because the file is in iCloud Drive it appears on both devices. Privacy trade-off: Apple can read iCloud Drive unless Advanced Data Protection is on. This is stated on the setup screen.

**Still to verify on the iPhone:** `Append to Text File` creating the file on first run; Siri running the Shortcut from the lock screen; the installed PWA's Files picker opening `inbox.txt`.

**Parser** (`src/parser`, deterministic, no LLM, 43 tests): amounts (`350`, `₹350`, `Rs. 1,200`, `1.5k`, `2 thousand`, `1 lakh`, prefers the number marked as currency), type words (spent/paid/bought; received/earned/credited, salary/refund hints, "got" only when nothing points to spending; transferred/moved/withdrew), account aliases (longest match first) with "from X to Y" for transfers, "withdrew" → bank to Cash, "paid credit card bill" → transfer to the card, UPI/GPay/Google Pay as payment method, dates (today, yesterday, day before yesterday, N days ago, weekdays, "on the 5th", "28 October", "15/10"), categories from the user's editable keywords, description from the leftover words. Returns `{ fields, issues[], input | null }`.

## 8. Backup & manual sync

- **Export**: full JSON (schema version, all entities incl. tombstones) → share sheet → Files / AirDrop. Optional passphrase encryption. CSV export of transactions for spreadsheets.
- **Import / sync**: merge by `id`; newer `updatedAt` wins; tombstones propagate deletes. Shows a preview (N new, N updated, N deleted, N conflicts resolved) before writing.
- **Restore**: same file, "replace everything" mode, behind a confirmation.
- iPhone ↔ Mac: export on one, import on the other. Since merge is idempotent, doing it in both directions is safe.

**As built (Phase 4):** Settings → Backup & sync. Backups are created first and saved with a second tap (the share sheet needs a fresh tap, and passphrase encryption takes about a second on a phone). Encrypted files use PBKDF2-SHA256 (600,000 iterations) and AES-256-GCM; a wrong passphrase or an altered file fails to open. Every imported row is validated against the app's own schemas, and rows pointing at missing accounts or categories are listed and skipped. The merge is recomputed inside the write transaction, so edits made while the preview is open aren't lost. After a merge, only one default account remains. Default categories and accounts are stamped with a fixed old timestamp (`2000-01-01`), so if storage is wiped and they're recreated, the edited versions in a backup still win. The dashboard asks for a backup when the last one is 7 or more days old.

## 9. iOS PWA limitations (what we're designing around)

- Separate storage for the Home Screen app vs Safari → always use the installed app on iPhone.
- No background sync / no file system access → inbox import and backups are user-initiated.
- Storage can be evicted under pressure → persist() + backup reminders.
- Service worker updates apply on next launch → show "Update available, reload" prompt.

## 10. Milestones

1. **Core app + deploy**: scaffold (TS strict, Tailwind, ESLint, Prettier, Vitest), PWA + offline, Dexie schema + seed, domain money/validation, add/edit/delete transactions, categories & accounts management, basic dashboard, deploy to Vercel so it's installable on the iPhone from day one.
2. **Financial features**: transfers, account balances, search/filter/sort, analytics (trends, category breakdown, income vs expense, MoM), month selector. Tests for balances and transfers.
3. **Voice**: parser + tests, in-app quick-add text box, inbox import + review queue, Shortcuts built and tested on iPhone.
4. **Portability & hardening**: JSON/CSV export, merge import, restore, encrypted backups, backup reminder, persist(), delete-all, CSP, privacy screen.

The plan's separate sync and deployment phases are folded into 1 and 4.

import {
  extractPayee,
  isNoise,
  pairTransfers,
  paymentMethodFor,
  payeeKey,
  reconcile,
  suggestCategory,
  type Conflict,
  type Located,
  type Matched,
  type StatementRow,
} from '../../domain/reconcile'
import type { Account, Category, Transaction, TransactionInput } from '../../domain/types'
import type { NewEntry } from '../../data/reconcile'
import type { EmailRow } from '../../parser/emailSweep'
import type { ParsedStatement } from '../../parser/statement'

export interface LoadedStatement {
  id: string
  name: string
  statement: ParsedStatement
  accountId: string
}

/** A statement row (or a pair of rows that are one transfer) PocketLog doesn't have yet. */
export interface MissingItem {
  id: string
  accountId: string
  row: StatementRow
  /** The other side of an own-account transfer, found on another statement. */
  pair?: Located<StatementRow>
}

export interface Draft {
  /** `cat:<categoryId>` or `acct:<accountId>` (a transfer with that account). */
  choice: string
  description: string
  needsReview: boolean
  /** Swept emails don't say which account paid, so it can be changed per row. */
  accountId?: string
}

/** Which kind of evidence a row comes from; decides which link it is remembered by. */
export type Layer = 'bank' | 'email'

export interface Plan {
  matched: (Matched & { accountId: string })[]
  conflicts: (Conflict & { accountId: string })[]
  missing: MissingItem[]
  extra: Transaction[]
  ignored: (StatementRow & { accountId: string })[]
}

export function buildPlan(
  files: readonly LoadedStatement[],
  transactions: readonly Transaction[],
  ignoredPayees: readonly string[],
): Plan {
  const plan: Plan = { matched: [], conflicts: [], missing: [], extra: [], ignored: [] }
  const missing: Located<StatementRow>[] = []
  const rowsByAccount = new Map<string, StatementRow[]>()

  // Two files for one account are compared as a single statement.
  for (const f of files) {
    if (!f.accountId) continue
    const rows = rowsByAccount.get(f.accountId) ?? []
    for (const row of f.statement.rows) {
      if (isNoise(row, ignoredPayees)) plan.ignored.push({ ...row, accountId: f.accountId })
      else if (!rows.some((r) => r.key === row.key)) rows.push(row)
    }
    rowsByAccount.set(f.accountId, rows)
  }

  for (const [accountId, rows] of rowsByAccount) {
    const result = reconcile(rows, transactions, accountId)
    plan.matched.push(...result.matched.map((m) => ({ ...m, accountId })))
    plan.conflicts.push(...result.conflicts.map((c) => ({ ...c, accountId })))
    plan.extra.push(...result.extra.filter((t) => !plan.extra.includes(t)))
    missing.push(...result.missing.map((row) => ({ accountId, row })))
  }

  const { pairs, rest } = pairTransfers(missing)
  plan.missing = [
    ...pairs.map(({ out, into }) => ({
      id: out.row.key,
      accountId: out.accountId,
      row: out.row,
      pair: into,
    })),
    ...rest.map((m) => ({ id: m.row.key, accountId: m.accountId, row: m.row })),
  ].sort((a, b) => b.row.date.localeCompare(a.row.date))
  return plan
}

const FALLBACK_NAMES = { expense: 'Miscellaneous', income: 'Other Income' } as const

/** What we'd do with a missing row if you just pressed Add. */
export function defaultDraft(
  item: MissingItem,
  transactions: readonly Transaction[],
  categories: readonly Category[],
): Draft {
  const payee = extractPayee(item.row.narration)
  if (item.pair) {
    return { choice: `acct:${item.pair.accountId}`, description: 'Transfer', needsReview: false }
  }
  const suggestion = suggestCategory(item.row, transactions, categories)
  if (suggestion) {
    return {
      choice: `cat:${suggestion.categoryId}`,
      description: payee,
      needsReview: suggestion.basis !== 'history',
    }
  }
  const type = item.row.direction === 'out' ? 'expense' : 'income'
  const fallback =
    categories.find((c) => c.type === type && c.name === FALLBACK_NAMES[type] && !c.archived) ??
    categories.find((c) => c.type === type && !c.archived)
  return {
    choice: fallback ? `cat:${fallback.id}` : '',
    description: payee,
    needsReview: true,
  }
}

/** Turns a row and the user's choice into something PocketLog can save; null if incomplete. */
export function toEntry(item: MissingItem, draft: Draft, layer: Layer = 'bank'): NewEntry | null {
  const { row } = item
  const accountId = draft.accountId ?? item.accountId
  const via = (row as Partial<EmailRow>).via
  const base = {
    amount: row.amount,
    date: row.date,
    paymentMethod: layer === 'email' ? emailPaymentMethod(via) : paymentMethodFor(row.narration),
    description: draft.description.trim(),
    merchant: extractPayee(row.narration),
  }
  let input: TransactionInput
  let ref: string | undefined = row.key
  if (draft.choice.startsWith('acct:')) {
    const other = draft.choice.slice(5)
    const outgoing = row.direction === 'out'
    input = {
      ...base,
      type: 'transfer',
      description: base.description || 'Transfer',
      accountId: outgoing ? accountId : other,
      toAccountId: outgoing ? other : accountId,
    }
    ref = undefined // a transfer has two bank rows; it rematches by amount and date
  } else if (draft.choice.startsWith('cat:')) {
    input = {
      ...base,
      type: row.direction === 'out' ? 'expense' : 'income',
      categoryId: draft.choice.slice(4),
      accountId,
    }
  } else return null
  return {
    input,
    needsReview: draft.needsReview,
    ...(ref && (layer === 'email' ? { emailRef: ref } : { bankRef: ref })),
  }
}

function emailPaymentMethod(via: string | undefined): TransactionInput['paymentMethod'] {
  if (via?.endsWith('upi')) return 'upi'
  if (via?.endsWith('card')) return 'card'
  return 'other'
}

export const sameDirectionKey = (row: StatementRow): string =>
  `${row.direction}:${payeeKey(extractPayee(row.narration))}`

/** Best-effort guess of which account a statement belongs to, from the bank name. */
export function guessAccount(
  bank: ParsedStatement['bank'],
  accounts: readonly Account[],
): string | undefined {
  const usable = accounts.filter((a) => !a.archived && !a.deletedAt && a.type !== 'cash')
  if (bank !== 'unknown') {
    const hit = usable.find(
      (a) => a.name.toLowerCase().includes(bank) || a.aliases.some((x) => x.includes(bank)),
    )
    if (hit) return hit.id
  }
  return undefined
}

// ---------- Swept emails ----------

export interface LoadedEmails {
  id: string
  name: string
  rows: EmailRow[]
  from: string
  to: string
  /** Lines in the file that couldn't be read. */
  skipped: number
}

/**
 * The account a receipt probably belongs to, from the template that read it ("hdfc-card",
 * "hdfc-upi"). Falls back to the default account; the person can change it per row.
 */
export function guessEmailAccount(
  via: string | undefined,
  accounts: readonly Account[],
  fallback: string,
): string {
  const usable = accounts.filter((a) => !a.archived && !a.deletedAt && a.type !== 'cash')
  const bank = via?.split('-')[0]
  const named = (a: Account) =>
    !!bank && (a.name.toLowerCase().includes(bank) || a.aliases.some((x) => x.includes(bank)))
  if (via?.endsWith('card')) {
    const cards = usable.filter((a) => a.type === 'credit_card')
    return (cards.find(named) ?? cards[0])?.id ?? fallback
  }
  if (bank && bank !== 'generic') {
    return usable.find((a) => a.type !== 'credit_card' && named(a))?.id ?? fallback
  }
  return fallback
}

/** The same comparison as a bank statement, against expenses on every account. */
export function buildEmailPlan(
  files: readonly LoadedEmails[],
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  ignoredPayees: readonly string[],
): Plan {
  const plan: Plan = { matched: [], conflicts: [], missing: [], extra: [], ignored: [] }
  const rows: EmailRow[] = []
  const seen = new Set<string>()
  for (const f of files) {
    for (const row of f.rows) {
      if (seen.has(row.key)) continue
      seen.add(row.key)
      if (isNoise(row, ignoredPayees)) plan.ignored.push({ ...row, accountId: '' })
      else rows.push(row)
    }
  }
  if (rows.length === 0) return plan

  const result = reconcile(rows, transactions, null, {
    refField: 'emailRef',
    conflictNeedsPayee: true,
  })
  plan.matched = result.matched.map((m) => ({ ...m, accountId: m.tx.accountId }))
  plan.conflicts = result.conflicts.map((c) => ({ ...c, accountId: c.tx.accountId }))

  // An entry is only "not in the emails" if this merchant does email you: cash and person-to-
  // person payments never will, so listing them would bury the real gaps.
  const senders = new Set(rows.map((r) => payeeKey(extractPayee(r.narration))))
  plan.extra = result.extra.filter((t) => senders.has(payeeKey(t.merchant || t.description)))

  const fallback = accounts.find((a) => a.isDefault && !a.archived)?.id ?? accounts[0]?.id ?? ''
  plan.missing = result.missing
    .map((row) => ({
      id: row.key,
      accountId: guessEmailAccount((row as EmailRow).via, accounts, fallback),
      row,
    }))
    .sort((a, b) => b.row.date.localeCompare(a.row.date))
  return plan
}

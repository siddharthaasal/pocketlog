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
}

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
export function toEntry(item: MissingItem, draft: Draft): NewEntry | null {
  const { row } = item
  const base = {
    amount: row.amount,
    date: row.date,
    paymentMethod: paymentMethodFor(row.narration),
    description: draft.description.trim(),
    merchant: extractPayee(row.narration),
  }
  let input: TransactionInput
  let bankRef: string | undefined = row.key
  if (draft.choice.startsWith('acct:')) {
    const other = draft.choice.slice(5)
    const outgoing = row.direction === 'out'
    input = {
      ...base,
      type: 'transfer',
      description: base.description || 'Transfer',
      accountId: outgoing ? item.accountId : other,
      toAccountId: outgoing ? other : item.accountId,
    }
    bankRef = undefined // a transfer has two bank rows; it rematches by amount and date
  } else if (draft.choice.startsWith('cat:')) {
    input = {
      ...base,
      type: row.direction === 'out' ? 'expense' : 'income',
      categoryId: draft.choice.slice(4),
      accountId: item.accountId,
    }
  } else return null
  return { input, needsReview: draft.needsReview, ...(bankRef && { bankRef }) }
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

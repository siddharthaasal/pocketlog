import type { Transaction, TransactionType } from './types'

export interface TransactionFilters {
  /** Matches every word against description, merchant and notes. */
  query?: string | undefined
  type?: TransactionType | undefined
  categoryId?: string | undefined
  /** Matches either side of a transfer. */
  accountId?: string | undefined
  /** Inclusive 'YYYY-MM-DD' bounds. */
  from?: string | undefined
  to?: string | undefined
}

export const SORT_ORDERS = ['newest', 'oldest', 'largest', 'smallest'] as const
export type SortOrder = (typeof SORT_ORDERS)[number]

export function filterTransactions(
  transactions: readonly Transaction[],
  filters: TransactionFilters,
): Transaction[] {
  const words = (filters.query ?? '').toLowerCase().split(/\s+/).filter(Boolean)

  return transactions.filter((t) => {
    if (t.deletedAt) return false
    if (filters.type && t.type !== filters.type) return false
    if (filters.categoryId && t.categoryId !== filters.categoryId) return false
    if (
      filters.accountId &&
      t.accountId !== filters.accountId &&
      t.toAccountId !== filters.accountId
    )
      return false
    if (filters.from && t.date < filters.from) return false
    if (filters.to && t.date > filters.to) return false
    if (words.length > 0) {
      const haystack = [t.description, t.merchant, t.notes].join(' ').toLowerCase()
      if (!words.every((w) => haystack.includes(w))) return false
    }
    return true
  })
}

const byNewest = (a: Transaction, b: Transaction) =>
  b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)

const comparators: Record<SortOrder, (a: Transaction, b: Transaction) => number> = {
  newest: byNewest,
  oldest: (a, b) => -byNewest(a, b),
  largest: (a, b) => b.amount - a.amount || byNewest(a, b),
  smallest: (a, b) => a.amount - b.amount || byNewest(a, b),
}

export function sortTransactions(
  transactions: readonly Transaction[],
  order: SortOrder,
): Transaction[] {
  return [...transactions].sort(comparators[order])
}

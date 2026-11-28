import type { Transaction } from './types'

export interface CategoryTotal {
  categoryId: string
  amount: number
}

export interface PeriodSummary {
  income: number
  expense: number
  /** income − expense; transfers are excluded. A refund counts against spending, not as income. */
  net: number
  expenseByCategory: CategoryTotal[]
}

/** How a transaction's amount divides across categories: its split parts, or all of it in one. */
export function categoryParts(t: Transaction): CategoryTotal[] {
  if (t.splits && t.splits.length > 0) return t.splits
  return [{ categoryId: t.categoryId ?? 'uncategorised', amount: t.amount }]
}

/** Totals for a set of transactions. Transfers and deleted rows never count. */
export function summarize(transactions: readonly Transaction[]): PeriodSummary {
  let income = 0
  let expense = 0
  const byCategory = new Map<string, number>()

  for (const t of transactions) {
    if (t.deletedAt) continue
    if (t.type === 'income' && t.refundOf) {
      // A refund or reimbursement: money back for an expense, so it reduces spending in the
      // expense's category (the entry carries that category) and is not income.
      expense -= t.amount
      const key = t.categoryId ?? 'uncategorised'
      byCategory.set(key, (byCategory.get(key) ?? 0) - t.amount)
    } else if (t.type === 'income') {
      income += t.amount
    } else if (t.type === 'expense') {
      expense += t.amount
      for (const part of categoryParts(t)) {
        byCategory.set(part.categoryId, (byCategory.get(part.categoryId) ?? 0) + part.amount)
      }
    }
  }

  const expenseByCategory = [...byCategory]
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount)

  return { income, expense, net: income - expense, expenseByCategory }
}

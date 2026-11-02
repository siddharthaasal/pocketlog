import type { Transaction } from './types'

export interface CategoryTotal {
  categoryId: string
  amount: number
}

export interface PeriodSummary {
  income: number
  expense: number
  /** income − expense; transfers are excluded. */
  net: number
  expenseByCategory: CategoryTotal[]
}

/** Totals for a set of transactions. Transfers and deleted rows never count. */
export function summarize(transactions: readonly Transaction[]): PeriodSummary {
  let income = 0
  let expense = 0
  const byCategory = new Map<string, number>()

  for (const t of transactions) {
    if (t.deletedAt) continue
    if (t.type === 'income') {
      income += t.amount
    } else if (t.type === 'expense') {
      expense += t.amount
      const key = t.categoryId ?? 'uncategorised'
      byCategory.set(key, (byCategory.get(key) ?? 0) + t.amount)
    }
  }

  const expenseByCategory = [...byCategory]
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount)

  return { income, expense, net: income - expense, expenseByCategory }
}

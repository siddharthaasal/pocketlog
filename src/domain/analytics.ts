import { monthOf, shiftMonth } from '../lib/dates'
import { summarize } from './summary'
import type { Transaction } from './types'

export interface MonthTotals {
  month: string
  income: number
  expense: number
  net: number
}

/** Totals for `count` months ending at `endMonth`, oldest first. Months with no activity are zero. */
export function monthlyTotals(
  transactions: readonly Transaction[],
  endMonth: string,
  count: number,
): MonthTotals[] {
  const months = Array.from({ length: count }, (_, i) => shiftMonth(endMonth, i - count + 1))
  const byMonth = new Map<string, Transaction[]>(months.map((m) => [m, []]))
  for (const t of transactions) byMonth.get(monthOf(t.date))?.push(t)

  return months.map((month) => {
    const { income, expense, net } = summarize(byMonth.get(month) ?? [])
    return { month, income, expense, net }
  })
}

export interface CategoryChange {
  categoryId: string
  current: number
  previous: number
}

/** Expense per category in two periods, largest current spend first. */
export function compareCategories(
  current: readonly Transaction[],
  previous: readonly Transaction[],
): CategoryChange[] {
  const now = new Map(summarize(current).expenseByCategory.map((c) => [c.categoryId, c.amount]))
  const before = new Map(summarize(previous).expenseByCategory.map((c) => [c.categoryId, c.amount]))
  const ids = new Set([...now.keys(), ...before.keys()])

  return [...ids]
    .map((categoryId) => ({
      categoryId,
      current: now.get(categoryId) ?? 0,
      previous: before.get(categoryId) ?? 0,
    }))
    .sort((a, b) => b.current - a.current || b.previous - a.previous)
}

/** Percentage change, or null when there is nothing to compare against. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / previous) * 100
}

export function transactionsInMonth(
  transactions: readonly Transaction[],
  month: string,
): Transaction[] {
  return transactions.filter((t) => monthOf(t.date) === month)
}

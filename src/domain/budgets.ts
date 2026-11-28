import { shiftMonth } from '../lib/dates'
import { monthlyTotals } from './analytics'
import type { HoldingRow } from './investments'
import type { CategoryTotal } from './summary'
import type { Account, Category, Transaction } from './types'

// ---------- Budgets ----------

/** A budget is flagged as close once this share of it is spent. */
export const BUDGET_WARN_AT = 0.8

export interface BudgetRow {
  category: Category
  /** Paise per month. */
  budget: number
  /** Net of refunds, so it can dip below zero. */
  spent: number
  /** budget − spent; negative once over. */
  left: number
  /** spent ÷ budget. */
  used: number
  status: 'ok' | 'near' | 'over'
}

/** Expense categories that have a budget, most used first, against a month's spending. */
export function budgetRows(
  categories: readonly Category[],
  spending: readonly CategoryTotal[],
): BudgetRow[] {
  const spent = new Map(spending.map((s) => [s.categoryId, s.amount]))
  return categories
    .filter((c) => c.type === 'expense' && !c.archived && !c.deletedAt && c.budget)
    .map((category) => {
      const budget = category.budget!
      const s = spent.get(category.id) ?? 0
      const used = s / budget
      const status = s > budget ? 'over' : used >= BUDGET_WARN_AT ? 'near' : 'ok'
      return { category, budget, spent: s, left: budget - s, used, status } as const
    })
    .sort((a, b) => b.used - a.used || a.category.name.localeCompare(b.category.name))
}

/**
 * How far through `month` the day `today` is, from 0 to 1: the share of the budget an even
 * pace would have used by now. 1 for past months, 0 for future ones.
 */
export function monthProgress(month: string, today: string): number {
  const current = today.slice(0, 7)
  if (month < current) return 1
  if (month > current) return 0
  const [y = 0, m = 1] = month.split('-').map(Number)
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Number(today.slice(8, 10)) / days
}

// ---------- Emergency fund ----------

/** Months of spending the emergency fund is measured against, before the current one. */
export const EMERGENCY_LOOKBACK = 6

/** What counts as savings: money you can reach today, not credit cards or investment accounts. */
export function savingsBalance(
  accounts: readonly Account[],
  balances: ReadonlyMap<string, number>,
): number {
  return accounts
    .filter((a) => !a.archived && !a.deletedAt && ['bank', 'cash', 'wallet'].includes(a.type))
    .reduce((sum, a) => sum + (balances.get(a.id) ?? 0), 0)
}

/** Holdings you marked as emergency money, like a liquid fund, at their latest value. */
export function emergencyHoldings(rows: readonly HoldingRow[]): HoldingRow[] {
  return rows.filter((r) => r.holding.emergency && !r.holding.archived && r.value > 0)
}

export interface EmergencyCover {
  savings: number
  /** Average spending per month over the months used, net of refunds. */
  monthlySpend: number
  /** Full months that had any activity; fewer than the lookback while you are new. */
  monthsUsed: number
  /** savings ÷ monthlySpend, or null without a full month of spending. */
  months: number | null
}

/**
 * How many months your savings would cover at your usual spending. Uses the full months
 * before `month` (this month is still running), skipping months with no entries at all so
 * the time before you started using PocketLog doesn't drag the average down.
 */
export function emergencyCover(
  savings: number,
  transactions: readonly Transaction[],
  month: string,
  lookback = EMERGENCY_LOOKBACK,
): EmergencyCover {
  const totals = monthlyTotals(transactions, shiftMonth(month, -1), lookback).filter(
    (m) => m.income > 0 || m.expense > 0,
  )
  const spent = totals.reduce((sum, m) => sum + m.expense, 0)
  const monthlySpend = totals.length > 0 ? Math.round(spent / totals.length) : 0
  return {
    savings,
    monthlySpend,
    monthsUsed: totals.length,
    months: monthlySpend > 0 ? Math.max(0, savings) / monthlySpend : null,
  }
}

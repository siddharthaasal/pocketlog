import type { BudgetRow } from '../../domain/budgets'
import { formatINR } from '../../domain/money'

/** Same oranges and reds as the Over/Under tags on Allocation. */
export const BUDGET_COLORS: Record<BudgetRow['status'], string> = {
  ok: 'var(--accent)',
  near: '#f08c00',
  over: '#e03131',
}

/** "₹2,300 left" or "₹500 over". */
export const leftText = (left: number) =>
  left >= 0 ? `${formatINR(left)} left` : `${formatINR(-left)} over`

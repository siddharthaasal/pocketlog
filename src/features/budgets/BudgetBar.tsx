import type { BudgetRow } from '../../domain/budgets'
import { BUDGET_COLORS } from './budgetStyle'
import { cx } from '../../lib/cx'

/**
 * How much of a budget is spent. `pace` (0–1) draws a thin line where an even pace through
 * the month would be today, so you can see you are ahead of it before you go over.
 */
export function BudgetBar({
  used,
  status,
  pace,
  className,
}: {
  used: number
  status: BudgetRow['status']
  pace?: number
  className?: string
}) {
  const width = Math.min(1, Math.max(0, used)) * 100
  return (
    <div className={cx('relative h-1.5 rounded-full bg-surface-2', className)}>
      <div
        className="h-full rounded-full"
        style={{
          width: `${width > 0 ? Math.max(width, 2) : 0}%`,
          backgroundColor: BUDGET_COLORS[status],
        }}
      />
      {pace !== undefined && pace > 0 && pace < 1 && (
        <div
          className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-text/40"
          style={{ left: `calc(${pace * 100}% - 1px)` }}
          title="Where an even pace through the month would be today"
        />
      )}
    </div>
  )
}

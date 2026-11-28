import { Link } from 'wouter'
import { ChevronRightIcon } from '../../components/icons'
import { Card, Money, SectionTitle } from '../../components/ui'
import { budgetRows, monthProgress } from '../../domain/budgets'
import type { CategoryTotal } from '../../domain/summary'
import type { Category } from '../../domain/types'
import { cx } from '../../lib/cx'
import { todayISO } from '../../lib/dates'
import { BudgetBar } from '../budgets/BudgetBar'
import { BUDGET_COLORS, leftText } from '../budgets/budgetStyle'

/** This month's budgets on Home, the ones closest to their limit first. */
export function BudgetSummary({
  month,
  categories,
  spending,
}: {
  month: string
  categories: readonly Category[]
  spending: readonly CategoryTotal[]
}) {
  const rows = budgetRows(categories, spending)
  const href = `/budgets${month === todayISO().slice(0, 7) ? '' : `?month=${month}`}`

  if (rows.length === 0) {
    return (
      <Link
        href={href}
        className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:bg-surface-2/60"
      >
        <span className="flex-1 text-[15px]">Set monthly budgets for your categories</span>
        <ChevronRightIcon width={18} height={18} className="text-muted" />
      </Link>
    )
  }

  const pace = monthProgress(month, todayISO())
  const budget = rows.reduce((sum, r) => sum + r.budget, 0)
  const spent = rows.reduce((sum, r) => sum + r.spent, 0)
  return (
    <section>
      <SectionTitle
        action={
          <Link href={href} className="text-[14px] text-accent">
            Open
          </Link>
        }
      >
        Budgets
      </SectionTitle>
      <Card className="divide-y divide-border">
        <div className="flex items-baseline justify-between gap-3 px-4 py-3 text-[14px] text-muted">
          <span>
            <Money paise={spent} className="font-medium text-text" /> of <Money paise={budget} />
          </span>
          <span>{leftText(budget - spent)}</span>
        </div>
        {rows.map((r) => (
          <div key={r.category.id} className="px-4 py-3">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-[15px]">{r.category.name}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-muted tabular-nums">
                <Money paise={r.spent} /> of <Money paise={r.budget} />
              </span>
              <span
                className={cx(
                  'shrink-0 text-[13px] tabular-nums',
                  r.status === 'ok' && 'text-muted',
                )}
                style={r.status === 'ok' ? undefined : { color: BUDGET_COLORS[r.status] }}
              >
                {leftText(r.left)}
              </span>
            </div>
            <BudgetBar used={r.used} status={r.status} pace={pace} className="mt-2" />
          </div>
        ))}
      </Card>
    </section>
  )
}

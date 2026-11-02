import { useMemo } from 'react'
import { Link, useSearchParams } from 'wouter'
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/icons'
import { Card, CategoryBadge, EmptyState, Loading, Money, SectionTitle } from '../../components/ui'
import { cx } from '../../lib/cx'
import { useLookups, useTransactionsInMonth } from '../../data/hooks'
import { summarize } from '../../domain/summary'
import { currentMonth, formatMonth, shiftMonth } from '../../lib/dates'
import { TransactionRow } from '../transactions/TransactionRow'

const MONTH_PATTERN = /^\d{4}-\d{2}$/

function useMonthParam(): [string, (month: string) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get('month')
  const month = raw && MONTH_PATTERN.test(raw) ? raw : currentMonth()
  const setMonth = (next: string) =>
    setParams(next === currentMonth() ? {} : { month: next }, { replace: true })
  return [month, setMonth]
}

export function DashboardPage() {
  const [month, setMonth] = useMonthParam()
  const transactions = useTransactionsInMonth(month)
  const lookups = useLookups()
  const summary = useMemo(() => summarize(transactions ?? []), [transactions])
  const isCurrent = month === currentMonth()

  return (
    <>
      <header className="mb-5 flex items-center justify-between">
        <h1 className="text-[28px] font-semibold tracking-tight">{formatMonth(month)}</h1>
        <div className="flex">
          <MonthButton label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeftIcon />
          </MonthButton>
          <MonthButton
            label="Next month"
            disabled={isCurrent}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <ChevronRightIcon />
          </MonthButton>
        </div>
      </header>

      {!transactions || !lookups ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          <Card className="p-5">
            <div className="text-[13px] font-medium text-muted">Spent</div>
            <div className="mt-1 text-[40px] leading-none font-semibold tracking-tight">
              <Money paise={summary.expense} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4">
              <Stat label="Income" paise={summary.income} />
              <Stat label="Net" paise={summary.net} negative={summary.net < 0} />
            </div>
          </Card>

          {transactions.length === 0 ? (
            <EmptyState title={`No transactions in ${formatMonth(month)}.`}>
              <Link href="/add" className="text-[15px] font-medium text-accent">
                Add a transaction
              </Link>
            </EmptyState>
          ) : (
            <>
              {summary.expenseByCategory.length > 0 && (
                <section>
                  <SectionTitle>Spending by category</SectionTitle>
                  <Card className="divide-y divide-border">
                    {summary.expenseByCategory.map(({ categoryId, amount }) => {
                      const category = lookups.categories.get(categoryId)
                      const share = summary.expense > 0 ? amount / summary.expense : 0
                      return (
                        <div key={categoryId} className="flex items-center gap-3 px-4 py-3">
                          <CategoryBadge
                            icon={category?.icon ?? '❔'}
                            color={category?.color ?? '#868e96'}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="truncate text-[15px]">
                                {category?.name ?? 'Uncategorised'}
                              </span>
                              <Money paise={amount} className="text-[15px]" />
                            </div>
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.max(share * 100, 1)}%`,
                                    backgroundColor: category?.color ?? '#868e96',
                                  }}
                                />
                              </div>
                              <span className="w-9 text-right text-[12px] text-muted tabular-nums">
                                {Math.round(share * 100)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </Card>
                </section>
              )}

              <section>
                <SectionTitle
                  action={
                    <Link href="/transactions" className="text-[14px] text-accent">
                      See all
                    </Link>
                  }
                >
                  Recent
                </SectionTitle>
                <Card className="divide-y divide-border overflow-hidden">
                  {transactions.slice(0, 5).map((t) => (
                    <TransactionRow key={t.id} t={t} lookups={lookups} />
                  ))}
                </Card>
              </section>
            </>
          )}
        </div>
      )}
    </>
  )
}

function Stat({ label, paise, negative }: { label: string; paise: number; negative?: boolean }) {
  return (
    <div>
      <div className="text-[13px] text-muted">{label}</div>
      <Money paise={paise} className={cx('text-[17px] font-medium', negative && 'text-negative')} />
    </div>
  )
}

function MonthButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-full text-accent hover:bg-surface-2 disabled:text-muted disabled:opacity-40"
    >
      {children}
    </button>
  )
}

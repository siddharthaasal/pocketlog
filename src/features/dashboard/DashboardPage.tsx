import { useMemo } from 'react'
import { Link } from 'wouter'
import { ChevronRightIcon, MicIcon } from '../../components/icons'
import { Card, CategoryBadge, EmptyState, Loading, Money, SectionTitle } from '../../components/ui'
import { cx } from '../../lib/cx'
import { useBalances, useLookups, useReviewQueue, useTransactionsInMonth } from '../../data/hooks'
import { totalBalance } from '../../domain/balances'
import { summarize } from '../../domain/summary'
import { formatMonth } from '../../lib/dates'
import { MonthSwitcher } from '../shared/MonthSwitcher'
import { BackupReminder } from './BackupReminder'
import { useMonthParam } from '../shared/useMonthParam'
import { TransactionRow } from '../transactions/TransactionRow'

export function DashboardPage() {
  const [month, setMonth] = useMonthParam()
  const transactions = useTransactionsInMonth(month)
  const lookups = useLookups()
  const balances = useBalances()
  const review = useReviewQueue()
  const summary = useMemo(() => summarize(transactions ?? []), [transactions])

  return (
    <>
      <div className="mb-5">
        <MonthSwitcher month={month} onChange={setMonth} />
      </div>

      {!transactions || !lookups ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          <BackupReminder />
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

          <Link
            href="/inbox"
            className="flex items-center gap-3 rounded-2xl bg-surface px-5 py-3.5 hover:bg-surface-2/60"
          >
            <MicIcon width={18} height={18} className="text-accent" />
            <span className="flex-1 text-[15px]">
              {review && review.length > 0 ? 'Siri entries to review' : 'Import Siri entries'}
            </span>
            {review && review.length > 0 && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[13px] font-medium text-accent-fg tabular-nums">
                {review.length}
              </span>
            )}
            <ChevronRightIcon width={18} height={18} className="text-muted" />
          </Link>

          {balances && (
            <Link
              href="/analytics#accounts"
              className="flex items-center justify-between rounded-2xl bg-surface px-5 py-3.5 hover:bg-surface-2/60"
            >
              <span className="text-[15px] text-muted">Across all accounts</span>
              <span className="flex items-center gap-1">
                <Money paise={totalBalance(balances)} className="text-[15px] font-medium" />
                <ChevronRightIcon width={18} height={18} className="text-muted" />
              </span>
            </Link>
          )}

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

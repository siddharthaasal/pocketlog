import { useEffect, useMemo } from 'react'
import { MonthlyColumns } from '../../components/MonthlyColumns'
import {
  Card,
  CategoryBadge,
  EmptyState,
  Loading,
  Money,
  PageHeader,
  SectionTitle,
} from '../../components/ui'
import { useAllTransactions, useBalances, useLookups, type Lookups } from '../../data/hooks'
import {
  compareCategories,
  monthlyTotals,
  percentChange,
  transactionsInMonth,
} from '../../domain/analytics'
import { totalBalance } from '../../domain/balances'
import { formatINR } from '../../domain/money'
import { summarize } from '../../domain/summary'
import { ACCOUNT_TYPE_LABELS, type Transaction } from '../../domain/types'
import { cx } from '../../lib/cx'
import { formatMonth, fromISODate, shiftMonth } from '../../lib/dates'
import { MonthSwitcher } from '../shared/MonthSwitcher'
import { useMonthParam } from '../shared/useMonthParam'

const TREND_MONTHS = 6
const TOP_CATEGORIES = 5

const monthName = (month: string, style: 'short' | 'long' = 'short') =>
  fromISODate(`${month}-01`).toLocaleDateString('en-IN', { month: style })

export function AnalyticsPage() {
  const [month, setMonth] = useMonthParam()
  const transactions = useAllTransactions()
  const lookups = useLookups()
  const balances = useBalances()

  // Support /analytics#accounts links once the content has rendered.
  const ready = Boolean(transactions && lookups && balances)
  useEffect(() => {
    if (ready && window.location.hash) {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView()
    }
  }, [ready])

  const stats = useMemo(() => {
    if (!transactions) return undefined
    const previousMonth = shiftMonth(month, -1)
    const current = transactionsInMonth(transactions, month)
    const previous = transactionsInMonth(transactions, previousMonth)
    const year = month.slice(0, 4)
    const yearToDate = transactions.filter(
      (t) => t.date.startsWith(year) && t.date <= `${month}-31`,
    )
    return {
      previousMonth,
      now: summarize(current),
      before: summarize(previous),
      trend: monthlyTotals(transactions, month, TREND_MONTHS),
      categories: compareCategories(current, previous),
      yearTop: summarize(yearToDate).expenseByCategory.slice(0, TOP_CATEGORIES),
      yearExpense: summarize(yearToDate).expense,
      year,
    }
  }, [transactions, month])

  return (
    <>
      <PageHeader title="Analytics" />
      <div className="mb-5">
        <MonthSwitcher month={month} onChange={setMonth} as="h2" />
      </div>

      {!stats || !lookups || !balances || !transactions ? (
        <Loading />
      ) : transactions.length === 0 ? (
        <EmptyState title="Analytics appear once you add transactions." />
      ) : (
        <div className="space-y-7">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile
              label="Spent"
              value={stats.now.expense}
              previous={stats.before.expense}
              previousMonth={stats.previousMonth}
              upIsGood={false}
            />
            <StatTile
              label="Income"
              value={stats.now.income}
              previous={stats.before.income}
              previousMonth={stats.previousMonth}
              upIsGood
            />
            <Card className="col-span-2 p-4 sm:col-span-1">
              <div className="text-[13px] text-muted">Saved</div>
              <Money
                paise={stats.now.net}
                className={cx('text-[20px] font-semibold', stats.now.net < 0 && 'text-negative')}
              />
              <div className="mt-1 text-[13px] text-muted">
                {stats.now.income > 0
                  ? `${Math.round((stats.now.net / stats.now.income) * 100)}% of income`
                  : 'No income this month'}
              </div>
            </Card>
          </div>

          <section>
            <SectionTitle>Spending, last {TREND_MONTHS} months</SectionTitle>
            <Card className="px-3 pt-4 pb-2">
              <MonthlyColumns
                data={stats.trend.map((m) => ({ month: m.month, value: m.expense }))}
                selected={month}
                onSelect={setMonth}
                label={`Monthly spending for the ${TREND_MONTHS} months to ${formatMonth(month)}`}
              />
            </Card>
            <p className="mt-2 px-1 text-[13px] text-muted">Tap a month to see its details.</p>
          </section>

          <section>
            <SectionTitle>Income vs expenses</SectionTitle>
            <Card className="overflow-x-auto">
              <table className="w-full text-[14px] tabular-nums">
                <thead>
                  <tr className="text-left text-[12px] text-muted">
                    <th className="px-4 py-2.5 font-medium">Month</th>
                    <th className="px-2 py-2.5 text-right font-medium">Income</th>
                    <th className="px-2 py-2.5 text-right font-medium">Spent</th>
                    <th className="px-4 py-2.5 text-right font-medium">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border border-t border-border">
                  {[...stats.trend].reverse().map((m) => (
                    <tr
                      key={m.month}
                      onClick={() => setMonth(m.month)}
                      className={cx(
                        'cursor-pointer',
                        m.month === month ? 'bg-surface-2/70 font-medium' : 'hover:bg-surface-2/40',
                      )}
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {monthName(m.month)}
                        {m.month.slice(0, 4) !== month.slice(0, 4) && (
                          <span className="text-muted"> ’{m.month.slice(2, 4)}</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right whitespace-nowrap">
                        {formatINR(m.income)}
                      </td>
                      <td className="px-2 py-2.5 text-right whitespace-nowrap">
                        {formatINR(m.expense)}
                      </td>
                      <td
                        className={cx(
                          'px-4 py-2.5 text-right whitespace-nowrap',
                          m.net < 0 && 'text-negative',
                        )}
                      >
                        {formatINR(m.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>

          {stats.categories.length > 0 && (
            <section>
              <SectionTitle>
                Categories, {monthName(month)} vs {monthName(stats.previousMonth)}
              </SectionTitle>
              <Card className="divide-y divide-border overflow-hidden">
                {stats.categories.map((c) => (
                  <CategoryComparisonRow
                    key={c.categoryId}
                    lookups={lookups}
                    categoryId={c.categoryId}
                    current={c.current}
                    previous={c.previous}
                  />
                ))}
              </Card>
            </section>
          )}

          {stats.yearTop.length > 0 && (
            <section>
              <SectionTitle>Top categories in {stats.year}</SectionTitle>
              <Card className="divide-y divide-border overflow-hidden">
                {stats.yearTop.map((c, i) => {
                  const category = lookups.categories.get(c.categoryId)
                  const share = stats.yearExpense > 0 ? c.amount / stats.yearExpense : 0
                  return (
                    <div key={c.categoryId} className="flex items-center gap-3 px-4 py-3">
                      <span className="w-4 text-[13px] text-muted tabular-nums">{i + 1}</span>
                      <CategoryBadge
                        icon={category?.icon ?? '❔'}
                        color={category?.color ?? '#868e96'}
                      />
                      <span className="min-w-0 flex-1 truncate text-[15px]">
                        {category?.name ?? 'Uncategorised'}
                      </span>
                      <span className="text-right">
                        <Money paise={c.amount} className="block text-[15px]" />
                        <span className="text-[12px] text-muted tabular-nums">
                          {Math.round(share * 100)}% of spending
                        </span>
                      </span>
                    </div>
                  )
                })}
              </Card>
            </section>
          )}

          <section id="accounts" className="scroll-mt-6">
            <SectionTitle>Account balances</SectionTitle>
            <AccountBalances lookups={lookups} balances={balances} transactions={transactions} />
          </section>
        </div>
      )}
    </>
  )
}

function StatTile({
  label,
  value,
  previous,
  previousMonth,
  upIsGood,
}: {
  label: string
  value: number
  previous: number
  previousMonth: string
  upIsGood: boolean
}) {
  const change = percentChange(value, previous)
  const rounded = change === null ? null : Math.round(change)
  const good = rounded !== null && rounded !== 0 && rounded > 0 === upIsGood

  return (
    <Card className="p-4">
      <div className="text-[13px] text-muted">{label}</div>
      <Money paise={value} className="text-[20px] font-semibold" />
      <div className="mt-1 text-[13px] text-muted">
        {rounded === null ? (
          `Nothing in ${monthName(previousMonth)}`
        ) : rounded === 0 ? (
          `Same as ${monthName(previousMonth)}`
        ) : (
          <>
            <span className={good ? 'text-positive' : 'text-negative'}>
              {rounded > 0 ? '↑' : '↓'} {Math.abs(rounded)}%
            </span>{' '}
            vs {monthName(previousMonth)}
          </>
        )}
      </div>
    </Card>
  )
}

function CategoryComparisonRow({
  lookups,
  categoryId,
  current,
  previous,
}: {
  lookups: Lookups
  categoryId: string
  current: number
  previous: number
}) {
  const category = lookups.categories.get(categoryId)
  const diff = current - previous
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <CategoryBadge icon={category?.icon ?? '❔'} color={category?.color ?? '#868e96'} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px]">{category?.name ?? 'Uncategorised'}</div>
        <div className="text-[13px] text-muted tabular-nums">
          {previous === 0
            ? 'New this month'
            : current === 0
              ? `${formatINR(previous)} last month`
              : diff === 0
                ? 'Same as last month'
                : `${diff > 0 ? '↑' : '↓'} ${formatINR(Math.abs(diff))} from ${formatINR(previous)}`}
        </div>
      </div>
      <Money paise={current} className={cx('text-[15px]', current === 0 && 'text-muted')} />
    </div>
  )
}

function AccountBalances({
  lookups,
  balances,
  transactions,
}: {
  lookups: Lookups
  balances: Map<string, number>
  transactions: Transaction[]
}) {
  // Archived accounts are listed only while they still hold money or have history.
  const used = new Set(transactions.flatMap((t) => [t.accountId, t.toAccountId]))
  const rows = [...lookups.accounts.values()].filter(
    (a) => !a.archived || (balances.get(a.id) ?? 0) !== 0 || used.has(a.id),
  )

  return (
    <Card className="divide-y divide-border overflow-hidden">
      {rows.map((a) => {
        const balance = balances.get(a.id) ?? 0
        const owed = a.type === 'credit_card' && balance < 0
        return (
          <div key={a.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px]">
                {a.name}
                {a.archived && <span className="ml-2 text-[12px] text-muted">Archived</span>}
              </div>
              <div className="text-[13px] text-muted">{ACCOUNT_TYPE_LABELS[a.type]}</div>
            </div>
            <div className="text-right">
              <Money
                paise={owed ? -balance : balance}
                className={cx('block text-[15px]', !owed && balance < 0 && 'text-negative')}
              />
              {owed && <span className="text-[12px] text-muted">owed</span>}
            </div>
          </div>
        )
      })}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-[15px] font-medium">Total</span>
        <Money paise={totalBalance(balances)} className="text-[15px] font-semibold" />
      </div>
    </Card>
  )
}

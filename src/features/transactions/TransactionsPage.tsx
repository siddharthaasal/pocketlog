import type { ReactNode, SelectHTMLAttributes } from 'react'
import { Link, useSearchParams } from 'wouter'
import { Card, EmptyState, Loading, Money, PageHeader, TextInput } from '../../components/ui'
import { useAllTransactions, useLookups } from '../../data/hooks'
import {
  SORT_ORDERS,
  filterTransactions,
  sortTransactions,
  type SortOrder,
  type TransactionFilters,
} from '../../domain/filters'
import { summarize } from '../../domain/summary'
import { TRANSACTION_TYPES, type Transaction, type TransactionType } from '../../domain/types'
import { cx } from '../../lib/cx'
import { currentMonth, formatDayHeading, monthBounds, shiftMonth, todayISO } from '../../lib/dates'
import { TransactionRow } from './TransactionRow'

const PERIODS = {
  all: 'All time',
  'this-month': 'This month',
  'last-month': 'Last month',
  '3-months': 'Last 3 months',
  'this-year': 'This year',
  custom: 'Custom dates',
} as const
type Period = keyof typeof PERIODS

const SORT_LABELS: Record<SortOrder, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  largest: 'Largest amount',
  smallest: 'Smallest amount',
}

const TYPE_LABELS: Record<TransactionType, string> = {
  expense: 'Expenses',
  income: 'Income',
  transfer: 'Transfers',
}

function periodRange(period: Period, from: string, to: string): [string?, string?] {
  const month = currentMonth()
  switch (period) {
    case 'this-month':
      return monthBounds(month)
    case 'last-month':
      return monthBounds(shiftMonth(month, -1))
    case '3-months':
      return [`${shiftMonth(month, -2)}-01`, todayISO()]
    case 'this-year':
      return [`${month.slice(0, 4)}-01-01`, `${month.slice(0, 4)}-12-31`]
    case 'custom':
      return [from || undefined, to || undefined]
    default:
      return []
  }
}

interface DayGroup {
  date: string
  items: Transaction[]
  /** Expenses for the day; income and transfers excluded. */
  spent: number
}

function groupByDay(transactions: readonly Transaction[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const t of transactions) {
    let group = groups.at(-1)
    if (!group || group.date !== t.date) {
      group = { date: t.date, items: [], spent: 0 }
      groups.push(group)
    }
    group.items.push(t)
    if (t.type === 'expense') group.spent += t.amount
  }
  return groups
}

/** Filters live in the URL so they survive opening a transaction and coming back. */
function useFilterParams() {
  const [params, setParams] = useSearchParams()
  const get = (key: string) => params.get(key) ?? ''
  const type = get('type')
  const period = (get('period') in PERIODS ? get('period') : 'all') as Period
  const sort = (SORT_ORDERS as readonly string[]).includes(get('sort'))
    ? (get('sort') as SortOrder)
    : 'newest'

  const set = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )

  const [from, to] = periodRange(period, get('from'), get('to'))
  const filters: TransactionFilters = {
    query: get('q'),
    type: (TRANSACTION_TYPES as readonly string[]).includes(type)
      ? (type as TransactionType)
      : undefined,
    categoryId: get('category') || undefined,
    accountId: get('account') || undefined,
    from,
    to,
  }
  const active =
    Boolean(filters.query || filters.type || filters.categoryId || filters.accountId) ||
    period !== 'all'

  return {
    raw: {
      q: get('q'),
      type,
      category: get('category'),
      account: get('account'),
      from: get('from'),
      to: get('to'),
    },
    filters,
    period,
    sort,
    active,
    set,
    clear: () => setParams(sort === 'newest' ? {} : { sort }, { replace: true }),
  }
}

export function TransactionsPage() {
  const transactions = useAllTransactions()
  const lookups = useLookups()
  const f = useFilterParams()

  // Cheap at personal scale (thousands of rows), so no memoisation needed.
  const results = sortTransactions(filterTransactions(transactions ?? [], f.filters), f.sort)
  const totals = summarize(results)
  const byDate = f.sort === 'newest' || f.sort === 'oldest'

  const categories = lookups ? [...lookups.categories.values()] : []
  const accounts = lookups ? [...lookups.accounts.values()] : []

  return (
    <>
      <PageHeader title="Transactions" />

      <div className="mb-5 space-y-3">
        <TextInput
          type="search"
          placeholder="Search description, merchant, notes"
          value={f.raw.q}
          onChange={(e) => f.set('q', e.target.value)}
          aria-label="Search transactions"
          enterKeyHint="search"
        />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
          <Chip
            aria-label="Type"
            value={f.raw.type}
            active={Boolean(f.filters.type)}
            onChange={(e) => {
              f.set('type', e.target.value)
              // A category only makes sense for its own type.
              if (e.target.value === 'transfer') f.set('category', '')
            }}
          >
            <option value="">All types</option>
            {TRANSACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </Chip>
          <Chip
            aria-label="Category"
            value={f.raw.category}
            active={Boolean(f.filters.categoryId)}
            onChange={(e) => f.set('category', e.target.value)}
          >
            <option value="">All categories</option>
            {(['expense', 'income'] as const).map((type) => (
              <optgroup key={type} label={type === 'expense' ? 'Expense' : 'Income'}>
                {categories
                  .filter((c) => c.type === type)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.archived ? ' (archived)' : ''}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Chip>
          <Chip
            aria-label="Account"
            value={f.raw.account}
            active={Boolean(f.filters.accountId)}
            onChange={(e) => f.set('account', e.target.value)}
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.archived ? ' (archived)' : ''}
              </option>
            ))}
          </Chip>
          <Chip
            aria-label="Period"
            value={f.period}
            active={f.period !== 'all'}
            onChange={(e) => f.set('period', e.target.value === 'all' ? '' : e.target.value)}
          >
            {Object.entries(PERIODS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Chip>
          <Chip
            aria-label="Sort"
            value={f.sort}
            active={false}
            onChange={(e) => f.set('sort', e.target.value === 'newest' ? '' : e.target.value)}
          >
            {SORT_ORDERS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </Chip>
        </div>

        {f.period === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <TextInput
              type="date"
              aria-label="From date"
              value={f.raw.from}
              max={f.raw.to || undefined}
              onChange={(e) => f.set('from', e.target.value)}
            />
            <TextInput
              type="date"
              aria-label="To date"
              value={f.raw.to}
              min={f.raw.from || undefined}
              onChange={(e) => f.set('to', e.target.value)}
            />
          </div>
        )}

        {f.active && transactions && (
          <div className="flex items-baseline justify-between gap-3 px-1 text-[13px] text-muted">
            <span className="tabular-nums">
              {results.length} {results.length === 1 ? 'transaction' : 'transactions'}
              {totals.expense > 0 && (
                <>
                  {' '}
                  · <Money paise={totals.expense} /> spent
                </>
              )}
              {totals.income > 0 && (
                <>
                  {' '}
                  · <Money paise={totals.income} /> income
                </>
              )}
            </span>
            <button type="button" onClick={f.clear} className="shrink-0 text-accent">
              Clear
            </button>
          </div>
        )}
      </div>

      {!transactions || !lookups ? (
        <Loading />
      ) : transactions.length === 0 ? (
        <EmptyState title="No transactions yet.">
          <Link href="/add" className="text-[15px] font-medium text-accent">
            Add your first one
          </Link>
        </EmptyState>
      ) : results.length === 0 ? (
        <EmptyState title="Nothing matches these filters.">
          <button type="button" onClick={f.clear} className="text-[15px] font-medium text-accent">
            Clear filters
          </button>
        </EmptyState>
      ) : byDate ? (
        <div className="space-y-5">
          {groupByDay(results).map((g) => (
            <section key={g.date}>
              <div className="mb-2 flex items-baseline justify-between px-1 text-[13px] font-medium text-muted">
                <h2>{formatDayHeading(g.date)}</h2>
                {g.spent > 0 && <Money paise={g.spent} />}
              </div>
              <Card className="divide-y divide-border overflow-hidden">
                {g.items.map((t) => (
                  <TransactionRow key={t.id} t={t} lookups={lookups} />
                ))}
              </Card>
            </section>
          ))}
        </div>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {results.map((t) => (
            <TransactionRow key={t.id} t={t} lookups={lookups} showDate />
          ))}
        </Card>
      )}
    </>
  )
}

function Chip({
  active,
  children,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { active: boolean; children: ReactNode }) {
  return (
    <select
      className={cx(
        // 16px text: iOS zooms into smaller form controls.
        'h-9 shrink-0 appearance-none rounded-full border px-3.5 text-[16px] outline-none focus-visible:border-accent',
        active
          ? 'border-accent bg-accent/10 font-medium text-text'
          : 'border-border bg-surface text-text',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

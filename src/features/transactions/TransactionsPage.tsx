import { useMemo } from 'react'
import { Link } from 'wouter'
import { Card, EmptyState, Loading, Money, PageHeader } from '../../components/ui'
import { useAllTransactions, useLookups } from '../../data/hooks'
import type { Transaction } from '../../domain/types'
import { formatDayHeading } from '../../lib/dates'
import { TransactionRow } from './TransactionRow'

interface DayGroup {
  date: string
  items: Transaction[]
  /** Expenses minus income for the day; transfers excluded. */
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

export function TransactionsPage() {
  const transactions = useAllTransactions()
  const lookups = useLookups()
  const groups = useMemo(() => groupByDay(transactions ?? []), [transactions])

  return (
    <>
      <PageHeader title="Transactions" />
      {!transactions || !lookups ? (
        <Loading />
      ) : transactions.length === 0 ? (
        <EmptyState title="No transactions yet.">
          <Link href="/add" className="text-[15px] font-medium text-accent">
            Add your first one
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
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
      )}
    </>
  )
}

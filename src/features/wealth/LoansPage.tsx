import { useMemo, useState } from 'react'
import { Link, useLocation } from 'wouter'
import {
  CalendarGlyph,
  CellInput,
  NumberGlyph,
  SelectGlyph,
  Table,
  Tag,
  TextGlyph,
  Td,
  Th,
  Tr,
} from '../../components/table'
import { Button, EmptyState, Loading, Money } from '../../components/ui'
import { useAllTransactions, useLoanBalances, useLoans } from '../../data/hooks'
import { saveLoanBalances } from '../../data/loans'
import {
  estimateOutstanding,
  loanRows,
  loanTotals,
  monthsLeft,
  type LoanRow,
} from '../../domain/loans'
import { paiseToInput, parseRupees } from '../../domain/money'
import { LOAN_KIND_LABELS, type LoanBalance, type Transaction } from '../../domain/types'
import { cx } from '../../lib/cx'
import { formatMonth, todayISO } from '../../lib/dates'
import { MonthSwitcher } from '../shared/MonthSwitcher'
import { useMonthParam } from '../shared/useMonthParam'
import { Stat, WealthShell, bpsText } from './WealthShell'

export function LoansPage() {
  const loans = useLoans()
  const balances = useLoanBalances()
  const transactions = useAllTransactions()
  const [month, setMonth] = useMonthParam()
  const [showClosed, setShowClosed] = useState(false)

  const rows = useMemo(
    () => (loans && balances ? loanRows(loans, balances, month) : []),
    [loans, balances, month],
  )

  if (!loans || !balances || !transactions) {
    return (
      <WealthShell>
        <Loading />
      </WealthShell>
    )
  }
  const totals = loanTotals(rows)
  const visible = rows.filter((r) => showClosed || r.loan.active)
  const closed = rows.length - rows.filter((r) => r.loan.active).length

  return (
    <WealthShell
      action={
        <Link
          href="/wealth/loans/new"
          className="inline-flex h-9 items-center rounded-lg bg-accent px-4 text-[14px] font-medium text-accent-fg hover:opacity-90"
        >
          Add loan
        </Link>
      }
    >
      <MonthSwitcher month={month} onChange={setMonth} as="h2" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="You owe">
          <Money paise={totals.homeLoan + totals.otherLoans} />
        </Stat>
        <Stat label="Home loan">
          <Money paise={totals.homeLoan} />
        </Stat>
        <Stat label="EMIs each month">
          <Money paise={totals.monthlyEmi} />
        </Stat>
        <Stat label="Money lent">
          <Money paise={totals.lent} />
        </Stat>
      </div>

      {loans.length === 0 ? (
        <EmptyState title="No loans yet.">
          <Link
            href="/wealth/loans/new"
            className="inline-flex h-10 items-center rounded-lg bg-accent px-5 text-[14.5px] font-medium text-accent-fg"
          >
            Add a loan
          </Link>
        </EmptyState>
      ) : (
        <LoansTable
          key={month}
          rows={visible}
          month={month}
          balances={balances}
          transactions={transactions}
        />
      )}
      {closed > 0 && (
        <button
          type="button"
          className="px-1 text-[13px] text-muted underline"
          onClick={() => setShowClosed((v) => !v)}
        >
          {showClosed ? 'Hide' : 'Show'} {closed} closed
        </button>
      )}
    </WealthShell>
  )
}

function LoansTable({
  rows,
  month,
  balances,
  transactions,
}: {
  rows: LoanRow[]
  month: string
  balances: readonly LoanBalance[]
  transactions: readonly Transaction[]
}) {
  const [, navigate] = useLocation()
  const [editing, setEditing] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [estimated, setEstimated] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const today = todayISO()

  function startEditing() {
    const next: Record<string, string> = {}
    const guessed = new Set<string>()
    for (const r of rows) {
      if (!r.loan.active) continue
      const exact = r.asOf === month
      const guess = exact ? null : estimateOutstanding(r.loan, balances, transactions, month)
      if (guess !== null) guessed.add(r.loan.id)
      const value = exact ? r.outstanding : (guess ?? r.outstanding)
      next[r.loan.id] = value === null ? '' : paiseToInput(value)
    }
    setDrafts(next)
    setEstimated(guessed)
    setError('')
    setEditing(true)
  }

  async function save() {
    const entries = []
    for (const r of rows) {
      const text = drafts[r.loan.id]
      if (text === undefined || text.trim() === '') continue
      const outstanding = parseRupees(text)
      if (outstanding === null) {
        setError(`Check the amount for ${r.loan.name}.`)
        return
      }
      entries.push({ loanId: r.loan.id, outstanding })
    }
    await saveLoanBalances(month, entries)
    setEditing(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-[13px] text-muted">
          {editing
            ? estimated.size > 0
              ? 'Some amounts are worked out from your repayments. Check them against your lender’s statement.'
              : `Enter what is left on each loan at the end of ${formatMonth(month)}.`
            : `Balances as of ${formatMonth(month)}, or the last month you entered.`}
        </p>
        {editing ? (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="h-8 px-3 text-[13.5px]"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button className="h-8 px-3 text-[13.5px]" onClick={() => void save()}>
              Save balances
            </Button>
          </div>
        ) : (
          <Button variant="secondary" className="h-8 px-3 text-[13.5px]" onClick={startEditing}>
            Update balances for {formatMonth(month).split(' ')[0]}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="px-1 text-[13px] text-negative">
          {error}
        </p>
      )}
      <Table minWidth={960}>
        <thead>
          <tr>
            <Th icon={<TextGlyph />}>Loan</Th>
            <Th className="w-36" icon={<SelectGlyph />}>
              Type
            </Th>
            <Th className="w-28" icon={<TextGlyph />}>
              With
            </Th>
            <Th className="w-24" icon={<NumberGlyph />}>
              EMI
            </Th>
            <Th className="w-16" icon={<NumberGlyph />}>
              Rate
            </Th>
            <Th className="w-32" icon={<NumberGlyph />}>
              Outstanding
            </Th>
            <Th className="w-24" icon={<NumberGlyph />}>
              Repaid
            </Th>
            <Th className="w-24" icon={<CalendarGlyph />}>
              Left
            </Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const left = monthsLeft(r.loan, today)
            const edit = editing && r.loan.active
            return (
              <Tr
                key={r.loan.id}
                {...(!edit && { onClick: () => navigate(`/wealth/loans/${r.loan.id}`) })}
              >
                <Td className={cx('max-w-0', !r.loan.active && 'text-muted')}>
                  <Link
                    href={`/wealth/loans/${r.loan.id}`}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {r.loan.name}
                  </Link>
                </Td>
                <Td>
                  <Tag color={r.loan.direction === 'owed' ? '#2f9e44' : undefined}>
                    {r.loan.direction === 'owed' ? 'Lent · ' : ''}
                    {LOAN_KIND_LABELS[r.loan.kind]}
                  </Tag>
                </Td>
                <Td className="max-w-0 text-muted">{r.loan.party ?? '-'}</Td>
                <Td className="text-right">{r.loan.emi ? <Money paise={r.loan.emi} /> : '-'}</Td>
                <Td className="text-right">{r.loan.rate ? bpsText(r.loan.rate) : '-'}</Td>
                <Td className="text-right">
                  {edit ? (
                    <CellInput
                      inputMode="decimal"
                      aria-label={`Outstanding on ${r.loan.name}`}
                      value={drafts[r.loan.id] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [r.loan.id]: e.target.value }))}
                      className="text-right"
                    />
                  ) : r.outstanding === null ? (
                    '-'
                  ) : (
                    <Money paise={r.outstanding} />
                  )}
                </Td>
                <Td>
                  {r.repaid === null ? (
                    <span className="text-muted">-</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-2">
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{ width: `${Math.round(r.repaid * 100)}%` }}
                        />
                      </span>
                      <span className="text-[12.5px] text-muted">
                        {Math.round(r.repaid * 100)}%
                      </span>
                    </span>
                  )}
                </Td>
                <Td className="text-muted">
                  {left === null
                    ? '-'
                    : left === 0
                      ? 'Due'
                      : left >= 12
                        ? `${(left / 12).toFixed(1)} yr`
                        : `${left} mo`}
                </Td>
              </Tr>
            )
          })}
        </tbody>
      </Table>
    </div>
  )
}

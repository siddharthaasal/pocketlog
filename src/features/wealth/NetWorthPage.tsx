import { useMemo, useState } from 'react'
import { Link } from 'wouter'
import {
  CalendarGlyph,
  CellInput,
  NumberGlyph,
  SmallButton,
  Table,
  Td,
  Th,
  Tr,
} from '../../components/table'
import { Button, Card, EmptyState, Loading, Money, TextInput } from '../../components/ui'
import {
  useAccounts,
  useAllTransactions,
  useHoldings,
  useLoanBalances,
  useLoans,
  useSnapshots,
  useValuations,
} from '../../data/hooks'
import {
  reopenMonth,
  saveInvestedBefore,
  saveSnapshot,
  useInvestedBefore,
} from '../../data/networth'
import { paiseToInput, parseRupees, parseSignedRupees } from '../../domain/money'
import {
  ASSET_BUCKETS,
  BUCKET_LABELS,
  LIABILITY_BUCKETS,
  changeOver,
  computeLines,
  emptyLines,
  savingsRate,
  snapshotRows,
  summarizeLines,
  type Lines,
  type SnapshotRow,
} from '../../domain/networth'
import { NET_WORTH_BUCKETS, type NetWorthBucket } from '../../domain/types'
import { cx } from '../../lib/cx'
import { currentMonth, formatMonth } from '../../lib/dates'
import { MonthSwitcher } from '../shared/MonthSwitcher'
import { useMonthParam } from '../shared/useMonthParam'
import { NetWorthChart } from './NetWorthChart'
import { Stat, WealthShell, percent } from './WealthShell'

const tone = (n: number) => (n > 0 ? 'text-positive' : n < 0 ? 'text-negative' : undefined)

export function NetWorthPage() {
  const accounts = useAccounts()
  const transactions = useAllTransactions()
  const holdings = useHoldings()
  const valuations = useValuations()
  const loans = useLoans()
  const loanBalances = useLoanBalances()
  const snapshots = useSnapshots()
  const investedBefore = useInvestedBefore()
  const [month, setMonth] = useMonthParam()

  const rows = useMemo(() => (snapshots ? snapshotRows(snapshots) : []), [snapshots])

  if (
    !accounts ||
    !transactions ||
    !holdings ||
    !valuations ||
    !loans ||
    !loanBalances ||
    !snapshots ||
    investedBefore === undefined
  ) {
    return (
      <WealthShell>
        <Loading />
      </WealthShell>
    )
  }

  const latest = rows[rows.length - 1]
  const rate = savingsRate(transactions, currentMonth(), 12)
  const yearChange = changeOver(rows, 12)
  const existing = snapshots.find((s) => s.month === month)

  return (
    <WealthShell>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Net worth" hint={latest ? formatMonth(latest.month) : 'No month closed yet'}>
          {latest ? <Money paise={latest.summary.netWorth} /> : '-'}
        </Stat>
        <Stat label="Change this month">
          {latest?.change == null ? (
            '-'
          ) : (
            <Money paise={latest.change} signed className={tone(latest.change)} />
          )}
        </Stat>
        <Stat
          label="Change in 12 months"
          hint={yearChange === null ? 'Needs a month a year back' : undefined}
        >
          {yearChange === null ? (
            '-'
          ) : (
            <Money paise={yearChange} signed className={tone(yearChange)} />
          )}
        </Stat>
        <Stat
          label="Savings rate"
          hint={
            rate.months > 0 ? `Over ${rate.months} month${rate.months === 1 ? '' : 's'}` : undefined
          }
        >
          {rate.rate === null
            ? '-'
            : rate.rate < -1
              ? 'Below −100%'
              : percent(rate.rate * 100, 0).replace('+', '')}
        </Stat>
      </div>

      {rows.length > 0 && <NetWorthChart rows={rows} />}

      <section className="space-y-3">
        <div className="px-1">
          <h2 className="text-[17px] font-semibold tracking-tight">Close a month</h2>
          <p className="text-[13px] text-muted">
            PocketLog fills in what it knows. Check the rest, then close the month to keep a copy
            that later edits won’t change.
          </p>
        </div>
        <MonthSwitcher month={month} onChange={setMonth} as="h2" />
        <CloseMonthForm
          key={`${month}-${existing?.updatedAt ?? 'open'}`}
          month={month}
          existingLines={existing ? (existing.lines as Lines) : null}
          closedAt={existing?.closedAt}
          sources={{ accounts, transactions, holdings, valuations, loans, loanBalances }}
          investedBefore={investedBefore}
        />
      </section>

      {rows.length === 0 ? (
        <EmptyState title="Closed months will appear here." />
      ) : (
        <History rows={rows} onOpen={setMonth} />
      )}
    </WealthShell>
  )
}

type Sources = Parameters<typeof computeLines>[1]

function CloseMonthForm({
  month,
  existingLines,
  closedAt,
  sources,
  investedBefore,
}: {
  month: string
  existingLines: Lines | null
  closedAt: string | undefined
  sources: Sources
  investedBefore: number
}) {
  const computed = useMemo(() => computeLines(month, sources), [month, sources])
  const start = existingLines ?? computed.lines
  const [draft, setDraft] = useState<Record<NetWorthBucket, string>>(
    () =>
      Object.fromEntries(NET_WORTH_BUCKETS.map((b) => [b, paiseToInput(start[b] ?? 0)])) as never,
  )
  const [before, setBefore] = useState(paiseToInput(investedBefore))
  const [error, setError] = useState('')

  const parsed = emptyLines()
  let invalid: NetWorthBucket | null = null
  for (const b of NET_WORTH_BUCKETS) {
    const v = parseSignedRupees(draft[b] || '0')
    if (v === null) invalid = b
    else parsed[b] = v
  }
  const summary = summarizeLines(parsed)
  const beforePaise = parseRupees(before || '0')

  async function close() {
    if (invalid || beforePaise === null) {
      setError(
        invalid ? `Check ${BUCKET_LABELS[invalid]}.` : 'Check the amount invested before tracking.',
      )
      return
    }
    setError('')
    await saveInvestedBefore(beforePaise)
    await saveSnapshot(month, parsed, beforePaise + computed.invested)
  }

  const hint = (b: NetWorthBucket) => {
    if (b === 'savings') return 'From your accounts at month end'
    if (b === 'card_dues') return 'From credit card balances'
    if (b === 'money_lent' || b === 'home_loan' || b === 'other_loans') return 'From Loans'
    return 'From Investments'
  }

  const row = (b: NetWorthBucket) => {
    const auto = computed.lines[b]
    const changed = parseSignedRupees(draft[b] || '0') !== auto
    return (
      <Tr key={b}>
        <Td>{BUCKET_LABELS[b]}</Td>
        <Td className="text-[13px] text-muted">{changed ? 'Changed by you' : hint(b)}</Td>
        <Td className="text-right">
          <CellInput
            inputMode="decimal"
            aria-label={BUCKET_LABELS[b]}
            value={draft[b]}
            onChange={(e) => setDraft((d) => ({ ...d, [b]: e.target.value }))}
            className="text-right"
          />
        </Td>
        <Td className="w-16 text-right">
          {changed && (
            <SmallButton
              onClick={() => setDraft((d) => ({ ...d, [b]: paiseToInput(auto) }))}
              title="Use the figure PocketLog worked out"
            >
              Reset
            </SmallButton>
          )}
        </Td>
      </Tr>
    )
  }

  const stale = computed.staleHoldings.length + computed.staleLoans.length

  return (
    <div className="space-y-3">
      {stale > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-surface px-4 py-3 text-[14px]">
          <span className="min-w-0 flex-1">
            {computed.staleHoldings.length > 0 &&
              `${computed.staleHoldings.length} holding${computed.staleHoldings.length === 1 ? '' : 's'} not updated for ${formatMonth(month).split(' ')[0]}. `}
            {computed.staleLoans.length > 0 &&
              `${computed.staleLoans.length} loan${computed.staleLoans.length === 1 ? '' : 's'} without a balance. `}
            Their last known figures are used.
          </span>
          <span className="flex gap-3">
            {computed.staleHoldings.length > 0 && (
              <Link href={`/wealth/investments?month=${month}`} className="text-accent">
                Update investments
              </Link>
            )}
            {computed.staleLoans.length > 0 && (
              <Link href={`/wealth/loans?month=${month}`} className="text-accent">
                Update loans
              </Link>
            )}
          </span>
        </div>
      )}
      <Table minWidth={560}>
        <thead>
          <tr>
            <Th>Assets</Th>
            <Th className="w-56">Source</Th>
            <Th className="w-40 text-right" icon={<NumberGlyph />}>
              {formatMonth(month).split(' ')[0]}
            </Th>
            <Th className="w-16" />
          </tr>
        </thead>
        <tbody>{ASSET_BUCKETS.map(row)}</tbody>
      </Table>
      <Table minWidth={560}>
        <thead>
          <tr>
            <Th>Liabilities</Th>
            <Th className="w-56">Source</Th>
            <Th className="w-40 text-right" icon={<NumberGlyph />}>
              {formatMonth(month).split(' ')[0]}
            </Th>
            <Th className="w-16" />
          </tr>
        </thead>
        <tbody>{LIABILITY_BUCKETS.map(row)}</tbody>
      </Table>

      <Card className="flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
        <Total label="Assets" paise={summary.assets} />
        <Total label="Liabilities" paise={summary.liabilities} />
        <Total label="Net worth" paise={summary.netWorth} strong />
        <label className="ml-auto flex items-center gap-2 text-[13px] text-muted">
          Invested before PocketLog
          <TextInput
            inputMode="decimal"
            value={before}
            onChange={(e) => setBefore(e.target.value)}
            className="h-8 w-32 text-right text-[14px]"
          />
        </label>
      </Card>

      {error && (
        <p role="alert" className="px-1 text-[13px] text-negative">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button className="h-10 px-5" onClick={() => void close()}>
          {closedAt
            ? `Update ${formatMonth(month).split(' ')[0]}`
            : `Close ${formatMonth(month).split(' ')[0]}`}
        </Button>
        {closedAt && (
          <>
            <Button variant="ghost" onClick={() => void reopenMonth(month)}>
              Reopen
            </Button>
            <span className="text-[13px] text-muted">
              Closed{' '}
              {new Date(closedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

function Total({
  label,
  paise,
  strong = false,
}: {
  label: string
  paise: number
  strong?: boolean
}) {
  return (
    <div>
      <div className="text-[13px] text-muted">{label}</div>
      <div className={cx('tabular-nums', strong ? 'text-[20px] font-semibold' : 'text-[16px]')}>
        <Money paise={paise} />
      </div>
    </div>
  )
}

function History({ rows, onOpen }: { rows: SnapshotRow[]; onOpen: (month: string) => void }) {
  const newest = [...rows].reverse()
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[17px] font-semibold tracking-tight">Closed months</h2>
      <Table minWidth={860}>
        <thead>
          <tr>
            <Th className="w-32" icon={<CalendarGlyph />}>
              Month
            </Th>
            <Th icon={<NumberGlyph />}>Net worth</Th>
            <Th icon={<NumberGlyph />}>Change</Th>
            <Th icon={<NumberGlyph />}>Assets</Th>
            <Th icon={<NumberGlyph />}>Liabilities</Th>
            <Th icon={<NumberGlyph />}>Investments</Th>
            <Th icon={<NumberGlyph />}>Put in</Th>
            <Th icon={<NumberGlyph />}>Growth</Th>
          </tr>
        </thead>
        <tbody>
          {newest.map((r) => (
            <Tr key={r.month} onClick={() => onOpen(r.month)}>
              <Td>{formatMonth(r.month)}</Td>
              <Td className="text-right font-medium">
                <Money paise={r.summary.netWorth} />
              </Td>
              <Td className="text-right">
                {r.change === null ? (
                  '-'
                ) : (
                  <Money paise={r.change} signed className={tone(r.change)} />
                )}
              </Td>
              <Td className="text-right">
                <Money paise={r.summary.assets} />
              </Td>
              <Td className="text-right">
                <Money paise={r.summary.liabilities} />
              </Td>
              <Td className="text-right">
                <Money paise={r.summary.investments} />
              </Td>
              <Td className="text-right">
                <Money paise={r.totalInvested} />
              </Td>
              <Td className="text-right">
                <Money paise={r.growth} signed className={tone(r.growth)} />
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </section>
  )
}

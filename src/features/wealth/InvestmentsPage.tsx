import { useMemo, useState } from 'react'
import { Link, useLocation } from 'wouter'
import {
  CalendarGlyph,
  NumberGlyph,
  SelectGlyph,
  Table,
  Tag,
  TextGlyph,
  Td,
  Th,
  Tr,
} from '../../components/table'
import { Button, EmptyState, Loading, Money, TextInput } from '../../components/ui'
import {
  useAccounts,
  useAllTransactions,
  useBalances,
  useHoldings,
  useValuations,
} from '../../data/hooks'
import { saveTargets, saveValuations, useTargets } from '../../data/investments'
import {
  allocation,
  contributedThrough,
  growthInMonth,
  holdingCashFlows,
  holdingRows,
  investedInMonth,
  latestValuations,
  targetsTotal,
  totalRows,
  xirr,
  type HoldingRow,
  type Targets,
} from '../../domain/investments'
import { paiseToInput, parseRupees } from '../../domain/money'
import {
  ASSET_CLASSES,
  ASSET_CLASS_LABELS,
  HOLDING_KIND_LABELS,
  type Account,
  type Transaction,
  type Valuation,
} from '../../domain/types'
import { cx } from '../../lib/cx'
import { formatMonth } from '../../lib/dates'
import { MonthSwitcher } from '../shared/MonthSwitcher'
import { useMonthParam } from '../shared/useMonthParam'
import { Stat, WealthShell, bpsText, percent } from './WealthShell'

const gainClass = (n: number) => (n > 0 ? 'text-positive' : n < 0 ? 'text-negative' : undefined)

export function InvestmentsPage() {
  const holdings = useHoldings()
  const valuations = useValuations()
  const transactions = useAllTransactions()
  const accounts = useAccounts()
  const balances = useBalances()
  const targets = useTargets()
  const [month, setMonth] = useMonthParam()
  const [showArchived, setShowArchived] = useState(false)

  const accountMap = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts])
  const rows = useMemo(
    () => (holdings && valuations ? holdingRows(holdings, valuations, month) : []),
    [holdings, valuations, month],
  )

  if (!holdings || !valuations || !transactions || !accounts || !balances || !targets) {
    return (
      <WealthShell>
        <Loading />
      </WealthShell>
    )
  }

  const visible = rows.filter((r) => showArchived || !r.holding.archived)
  const active = rows.filter((r) => !r.holding.archived)
  const totals = totalRows(active)
  const growth = growthInMonth(valuations, month)
  const putIn = investedInMonth(transactions, accountMap, month)
  const cash = accounts
    .filter((a) => !a.archived && ['bank', 'cash', 'wallet'].includes(a.type))
    .reduce((sum, a) => sum + (balances.get(a.id) ?? 0), 0)
  const archivedCount = rows.length - active.length

  return (
    <WealthShell
      action={
        <Link
          href="/wealth/investments/new"
          className="inline-flex h-9 items-center rounded-lg bg-accent px-4 text-[14px] font-medium text-accent-fg hover:opacity-90"
        >
          Add holding
        </Link>
      }
    >
      <MonthSwitcher month={month} onChange={setMonth} as="h2" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Invested">
          <Money paise={totals.invested} />
        </Stat>
        <Stat label="Worth now">
          <Money paise={totals.value} />
        </Stat>
        <Stat label="Gain" hint={percent(totals.gainPct)}>
          <Money paise={totals.gain} signed className={gainClass(totals.gain)} />
        </Stat>
        <Stat
          label={`Growth in ${formatMonth(month).split(' ')[0]}`}
          hint={
            growth === null
              ? 'Needs values for this and last month'
              : `After ${formatMoneyShort(putIn)} put in`
          }
        >
          {growth === null ? '—' : <Money paise={growth} signed className={gainClass(growth)} />}
        </Stat>
      </div>

      {holdings.length === 0 ? (
        <EmptyState title="No holdings yet.">
          <Link
            href="/wealth/investments/new"
            className="inline-flex h-10 items-center rounded-lg bg-accent px-5 text-[14.5px] font-medium text-accent-fg"
          >
            Add your first holding
          </Link>
        </EmptyState>
      ) : (
        <HoldingsTable
          key={month}
          rows={visible}
          month={month}
          transactions={transactions}
          accounts={accountMap}
          valuations={valuations}
        />
      )}
      {archivedCount > 0 && (
        <button
          type="button"
          className="px-1 text-[13px] text-muted underline"
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? 'Hide' : 'Show'} {archivedCount} archived
        </button>
      )}

      <AllocationSection rows={active} cash={cash} targets={targets} />
    </WealthShell>
  )
}

const shortMonth = (m: string) => `${formatMonth(m).slice(0, 3)} ${m.slice(0, 4)}`

const formatMoneyShort = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`

function HoldingsTable({
  rows,
  month,
  transactions,
  accounts,
  valuations,
}: {
  rows: HoldingRow[]
  month: string
  transactions: readonly Transaction[]
  accounts: ReadonlyMap<string, Account>
  valuations: readonly Valuation[]
}) {
  const [, navigate] = useLocation()
  const [editing, setEditing] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, { invested: string; value: string }>>({})
  const [error, setError] = useState('')
  const latest = latestValuations(valuations)

  function startEditing() {
    const next: Record<string, { invested: string; value: string }> = {}
    for (const r of rows) {
      if (r.holding.archived) continue
      // Carry last month's figures forward, and suggest "invested" from tagged transfers.
      const suggested = contributedThrough(r.holding.id, transactions, accounts, month)
      const invested = r.asOf ? r.invested : suggested
      next[r.holding.id] = {
        invested: r.asOf || suggested ? paiseToInput(invested) : '',
        value: r.asOf ? paiseToInput(r.value) : '',
      }
    }
    setDrafts(next)
    setError('')
    setEditing(true)
  }

  async function save() {
    const entries = []
    for (const r of rows) {
      const d = drafts[r.holding.id]
      if (!d || (d.value.trim() === '' && d.invested.trim() === '')) continue
      const invested = parseRupees(d.invested || '0')
      const value = parseRupees(d.value || '0')
      if (invested === null || value === null) {
        setError(`Check the amounts for ${r.holding.name}.`)
        return
      }
      entries.push({ holdingId: r.holding.id, invested, value })
    }
    await saveValuations(month, entries)
    setEditing(false)
  }

  const input = (id: string, key: 'invested' | 'value') => (
    <TextInput
      inputMode="decimal"
      aria-label={`${key === 'value' ? 'Value' : 'Invested'} for ${rows.find((r) => r.holding.id === id)?.holding.name}`}
      value={drafts[id]?.[key] ?? ''}
      onChange={(e) =>
        setDrafts((d) => ({
          ...d,
          [id]: { invested: '', value: '', ...d[id], [key]: e.target.value },
        }))
      }
      className="h-7! py-0! text-right text-[14px]"
    />
  )

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-[13px] text-muted">
          {editing
            ? `Enter what each holding was worth at the end of ${formatMonth(month)}.`
            : `Values as of ${formatMonth(month)}, or the last month you entered.`}
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
              Save values
            </Button>
          </div>
        ) : (
          <Button variant="secondary" className="h-8 px-3 text-[13.5px]" onClick={startEditing}>
            Update values for {formatMonth(month).split(' ')[0]}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="px-1 text-[13px] text-negative">
          {error}
        </p>
      )}
      <Table minWidth={900}>
        <thead>
          <tr>
            <Th icon={<TextGlyph />}>Holding</Th>
            <Th className="w-28" icon={<SelectGlyph />}>
              Type
            </Th>
            <Th className="w-24" icon={<SelectGlyph />}>
              Class
            </Th>
            <Th className="w-28" icon={<NumberGlyph />}>
              Invested
            </Th>
            <Th className="w-28" icon={<NumberGlyph />}>
              Worth
            </Th>
            <Th className="w-24" icon={<NumberGlyph />}>
              Gain
            </Th>
            <Th className="w-16" icon={<NumberGlyph />}>
              Gain %
            </Th>
            <Th className="w-20" icon={<NumberGlyph />}>
              Per year
            </Th>
            <Th className="w-20" icon={<CalendarGlyph />}>
              As of
            </Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const flows = holdingCashFlows(
              r.holding.id,
              transactions,
              accounts,
              latest.get(r.holding.id),
            )
            const yearly = flows.length > 1 ? xirr(flows) : null
            const go = () => navigate(`/wealth/investments/${r.holding.id}`)
            const edit = editing && !r.holding.archived
            return (
              <Tr key={r.holding.id} {...(!edit && { onClick: go })}>
                <Td className={cx('max-w-0', r.holding.archived && 'text-muted')}>
                  <Link
                    href={`/wealth/investments/${r.holding.id}`}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {r.holding.name}
                  </Link>
                </Td>
                <Td>
                  <Tag>{HOLDING_KIND_LABELS[r.holding.kind]}</Tag>
                </Td>
                <Td>
                  <Tag>{ASSET_CLASS_LABELS[r.holding.assetClass]}</Tag>
                </Td>
                <Td className="text-right">
                  {edit ? input(r.holding.id, 'invested') : <Money paise={r.invested} />}
                </Td>
                <Td className="text-right">
                  {edit ? input(r.holding.id, 'value') : <Money paise={r.value} />}
                </Td>
                <Td className={cx('text-right', gainClass(r.gain))}>
                  {r.asOf ? <Money paise={r.gain} signed /> : '—'}
                </Td>
                <Td className={cx('text-right', r.gainPct !== null && gainClass(r.gainPct))}>
                  {percent(r.gainPct)}
                </Td>
                <Td className="text-right">
                  <span title="Annual return, from the transfers you tagged to this holding">
                    {yearly === null ? '—' : percent(yearly * 100)}
                  </span>
                </Td>
                <Td className="text-muted">{r.asOf ? shortMonth(r.asOf) : '—'}</Td>
              </Tr>
            )
          })}
        </tbody>
      </Table>
    </div>
  )
}

function AllocationSection({
  rows,
  cash,
  targets,
}: {
  rows: HoldingRow[]
  cash: number
  targets: Targets
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const { rows: mix, total } = allocation(rows, cash, targets)

  const draftTargets = (): Targets | null => {
    const next = { ...targets }
    for (const c of ASSET_CLASSES) {
      const n = Number(draft[c] ?? 0)
      if (!Number.isFinite(n) || n < 0 || n > 100) return null
      next[c] = Math.round(n * 100)
    }
    return next
  }
  const draftTotal = (() => {
    const t = draftTargets()
    return t ? targetsTotal(t) : null
  })()

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight">Allocation</h2>
          <p className="text-[13px] text-muted">
            Your mix against your targets. Savings count as cash; a class is flagged once it is 2
            points away.
          </p>
        </div>
        {editing ? (
          <div className="flex items-center gap-2">
            <span
              className={cx('text-[13px]', draftTotal === 10000 ? 'text-muted' : 'text-negative')}
            >
              Total {draftTotal === null ? '—' : bpsText(draftTotal)}
            </span>
            <Button
              variant="ghost"
              className="h-8 px-3 text-[13.5px]"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button
              className="h-8 px-3 text-[13.5px]"
              disabled={draftTotal !== 10000}
              onClick={() => {
                const t = draftTargets()
                if (t) void saveTargets(t).then(() => setEditing(false))
              }}
            >
              Save targets
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            className="h-8 px-3 text-[13.5px]"
            onClick={() => {
              setDraft(Object.fromEntries(ASSET_CLASSES.map((c) => [c, String(targets[c] / 100)])))
              setEditing(true)
            }}
          >
            Edit targets
          </Button>
        )}
      </div>
      <Table minWidth={640}>
        <thead>
          <tr>
            <Th icon={<SelectGlyph />}>Class</Th>
            <Th className="w-24" icon={<NumberGlyph />}>
              Target
            </Th>
            <Th className="w-36" icon={<NumberGlyph />}>
              Worth
            </Th>
            <Th className="w-24" icon={<NumberGlyph />}>
              Actual
            </Th>
            <Th className="w-24" icon={<NumberGlyph />}>
              Gap
            </Th>
            <Th className="w-28" icon={<SelectGlyph />}>
              Status
            </Th>
          </tr>
        </thead>
        <tbody>
          {mix.map((r) => (
            <Tr key={r.assetClass}>
              <Td>
                <Tag>{ASSET_CLASS_LABELS[r.assetClass]}</Tag>
              </Td>
              <Td className="text-right">
                {editing ? (
                  <TextInput
                    inputMode="decimal"
                    aria-label={`Target for ${ASSET_CLASS_LABELS[r.assetClass]}`}
                    value={draft[r.assetClass] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [r.assetClass]: e.target.value }))}
                    className="h-7! py-0! text-right text-[14px]"
                  />
                ) : (
                  bpsText(r.targetBps)
                )}
              </Td>
              <Td className="text-right">
                <Money paise={r.value} />
              </Td>
              <Td className="text-right">{bpsText(r.actualBps)}</Td>
              <Td className="text-right">
                {r.gapBps === null
                  ? '—'
                  : `${r.gapBps > 0 ? '+' : r.gapBps < 0 ? '−' : ''}${bpsText(Math.abs(r.gapBps))}`}
              </Td>
              <Td>
                {r.status === 'over' && <Tag color="#e03131">Over target</Tag>}
                {r.status === 'under' && <Tag color="#f08c00">Under target</Tag>}
                {r.status === 'on' && (r.targetBps > 0 || r.value > 0) && (
                  <Tag color="#2f9e44">On target</Tag>
                )}
              </Td>
            </Tr>
          ))}
          <Tr>
            <Td className="font-medium">Total</Td>
            <Td className="text-right text-muted">{bpsText(targetsTotal(targets))}</Td>
            <Td className="text-right font-medium">
              <Money paise={total} />
            </Td>
            <Td />
            <Td />
            <Td />
          </Tr>
        </tbody>
      </Table>
    </section>
  )
}

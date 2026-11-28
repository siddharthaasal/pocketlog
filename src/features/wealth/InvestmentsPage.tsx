import { useMemo, useState } from 'react'
import { Link, useLocation } from 'wouter'
import {
  CalendarGlyph,
  CellInput,
  NumberGlyph,
  SelectGlyph,
  SmallButton,
  Table,
  Tag,
  TagSelect,
  TextGlyph,
  Td,
  Th,
  Tr,
} from '../../components/table'
import { Button, EmptyState, Loading, Money } from '../../components/ui'
import {
  useAccounts,
  useAllocationGroups,
  useAllTransactions,
  useHoldings,
  useValuations,
} from '../../data/hooks'
import { saveAllocation, saveValuations, setHoldingGroup } from '../../data/investments'
import {
  allocation,
  allocationProblem,
  contributedThrough,
  growthInMonth,
  holdingCashFlows,
  holdingRows,
  investedInMonth,
  groupTargetsTotal,
  latestValuations,
  totalRows,
  xirr,
  type AllocationRow,
  type GroupDraft,
  type HoldingRow,
} from '../../domain/investments'
import { paiseToInput, parseRupees } from '../../domain/money'
import {
  HOLDING_KIND_LABELS,
  type Account,
  type AllocationGroup,
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
  const groups = useAllocationGroups()
  const [month, setMonth] = useMonthParam()
  const [showArchived, setShowArchived] = useState(false)

  const accountMap = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts])
  const rows = useMemo(
    () => (holdings && valuations ? holdingRows(holdings, valuations, month) : []),
    [holdings, valuations, month],
  )

  if (!holdings || !valuations || !transactions || !accounts || !groups) {
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
  const archivedCount = rows.length - active.length

  return (
    <WealthShell
      action={
        <div className="flex gap-2">
          <Link
            href="/wealth/investments/import"
            className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-4 text-[14px] font-medium whitespace-nowrap hover:bg-surface-2"
          >
            <span className="sm:hidden">Import</span>
            <span className="hidden sm:inline">Import from Groww</span>
          </Link>
          <Link
            href="/wealth/investments/new"
            className="inline-flex h-9 items-center rounded-lg bg-accent px-4 text-[14px] font-medium whitespace-nowrap text-accent-fg hover:opacity-90"
          >
            Add holding
          </Link>
        </div>
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
          {growth === null ? '-' : <Money paise={growth} signed className={gainClass(growth)} />}
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
          groups={groups}
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

      <AllocationSection rows={active} groups={groups} />
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
  groups,
}: {
  rows: HoldingRow[]
  month: string
  transactions: readonly Transaction[]
  accounts: ReadonlyMap<string, Account>
  valuations: readonly Valuation[]
  groups: readonly AllocationGroup[]
}) {
  const [, navigate] = useLocation()
  const [editing, setEditing] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, { invested: string; value: string }>>({})
  const [error, setError] = useState('')
  const latest = latestValuations(valuations)
  const groupIds = new Set(groups.map((g) => g.id))

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
    <CellInput
      inputMode="decimal"
      aria-label={`${key === 'value' ? 'Value' : 'Invested'} for ${rows.find((r) => r.holding.id === id)?.holding.name}`}
      value={drafts[id]?.[key] ?? ''}
      onChange={(e) =>
        setDrafts((d) => ({
          ...d,
          [id]: { invested: '', value: '', ...d[id], [key]: e.target.value },
        }))
      }
      className="text-right"
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
            <Th className="w-36" icon={<SelectGlyph />}>
              Group
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
                <Td {...(!r.holding.emergency && { onClick: (e) => e.stopPropagation() })}>
                  {r.holding.emergency ? (
                    <Tag title="Counts towards the emergency fund, not Allocation">
                      Emergency money
                    </Tag>
                  ) : (
                    <TagSelect
                      aria-label={`Group for ${r.holding.name}`}
                      value={groupIds.has(r.holding.groupId ?? '') ? r.holding.groupId : ''}
                      onChange={(e) =>
                        void setHoldingGroup(r.holding.id, e.target.value || undefined)
                      }
                    >
                      <option value="">No group</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </TagSelect>
                  )}
                </Td>
                <Td className="text-right">
                  {edit ? input(r.holding.id, 'invested') : <Money paise={r.invested} />}
                </Td>
                <Td className="text-right">
                  {edit ? input(r.holding.id, 'value') : <Money paise={r.value} />}
                </Td>
                <Td className={cx('text-right', gainClass(r.gain))}>
                  {r.asOf ? <Money paise={r.gain} signed /> : '-'}
                </Td>
                <Td className={cx('text-right', r.gainPct !== null && gainClass(r.gainPct))}>
                  {percent(r.gainPct)}
                </Td>
                <Td className="text-right">
                  <span title="Annual return, from the transfers you tagged to this holding">
                    {yearly === null ? '-' : percent(yearly * 100)}
                  </span>
                </Td>
                <Td className="text-muted">{r.asOf ? shortMonth(r.asOf) : '-'}</Td>
              </Tr>
            )
          })}
        </tbody>
      </Table>
    </div>
  )
}

interface DraftRow {
  /** Stable React key; new rows get one before they have an id. */
  key: string
  id?: string
  name: string
  target: string
}

let draftKey = 0
const newDraftKey = () => `new-${++draftKey}`

function AllocationSection({ rows, groups }: { rows: HoldingRow[]; groups: AllocationGroup[] }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<DraftRow[]>([])
  const [error, setError] = useState('')
  const { rows: mix, total } = allocation(rows, groups)
  const byId = new Map(mix.filter((r) => r.group).map((r) => [r.group!.id, r]))
  const ungrouped = mix.find((r) => r.group === null)
  const emergency = rows.filter((r) => r.holding.emergency && r.value > 0)

  const drafts = (): GroupDraft[] | null => {
    const out: GroupDraft[] = []
    for (const d of draft) {
      const n = Number(d.target.trim() === '' ? 0 : d.target)
      if (!Number.isFinite(n) || n < 0 || n > 100) return null
      out.push({ ...(d.id && { id: d.id }), name: d.name.trim(), target: Math.round(n * 100) })
    }
    return out
  }
  const current = drafts()
  const draftTotal = current?.reduce((sum, d) => sum + d.target, 0) ?? null

  function startEditing() {
    setDraft(
      groups.map((g) => ({ key: g.id, id: g.id, name: g.name, target: String(g.target / 100) })),
    )
    setError('')
    setEditing(true)
  }

  async function save() {
    const next = drafts()
    if (!next) return setError('Enter each target as a percent from 0 to 100.')
    const problem = allocationProblem(next)
    if (problem) return setError(problem)
    await saveAllocation(next)
    setEditing(false)
  }

  const change = (key: string, field: 'name' | 'target', value: string) =>
    setDraft((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))

  const figures = (r: AllocationRow | undefined) => (
    <>
      <Td className="text-right">
        <Money paise={r?.value ?? 0} />
      </Td>
      <Td className="text-right">{bpsText(r?.actualBps ?? null)}</Td>
      <Td className="text-right">
        {r?.gapBps === null || r?.gapBps === undefined
          ? '-'
          : `${r.gapBps > 0 ? '+' : r.gapBps < 0 ? '−' : ''}${bpsText(Math.abs(r.gapBps))}`}
      </Td>
    </>
  )

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight">Allocation</h2>
          <p className="text-[13px] text-muted">
            Your mix against your targets. Pick each holding’s group in the table above. A group is
            flagged once it is 2 points off, or a fifth of its target if that is less.
            {emergency.length > 0 &&
              ` Emergency money (${emergency.map((r) => r.holding.name).join(', ')}) isn’t counted.`}
          </p>
        </div>
        {editing ? (
          <div className="flex items-center gap-2">
            <span
              className={cx('text-[13px]', draftTotal === 10000 ? 'text-muted' : 'text-negative')}
            >
              Total {draftTotal === null ? '-' : bpsText(draftTotal)}
            </span>
            <Button
              variant="ghost"
              className="h-8 px-3 text-[13.5px]"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button className="h-8 px-3 text-[13.5px]" onClick={() => void save()}>
              Save allocation
            </Button>
          </div>
        ) : (
          <Button variant="secondary" className="h-8 px-3 text-[13.5px]" onClick={startEditing}>
            {groups.length === 0 ? 'Add groups' : 'Edit groups'}
          </Button>
        )}
      </div>
      {error && editing && (
        <p role="alert" className="px-1 text-[13px] text-negative">
          {error}
        </p>
      )}
      <Table minWidth={640}>
        <thead>
          <tr>
            <Th icon={<TextGlyph />}>Group</Th>
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
          {editing
            ? draft.map((d) => (
                <Tr key={d.key}>
                  <Td className="max-w-0">
                    <CellInput
                      aria-label="Group name"
                      value={d.name}
                      maxLength={40}
                      placeholder="Group name"
                      onChange={(e) => change(d.key, 'name', e.target.value)}
                    />
                  </Td>
                  <Td className="text-right">
                    <CellInput
                      inputMode="decimal"
                      aria-label={`Target for ${d.name || 'new group'}`}
                      value={d.target}
                      placeholder="0"
                      onChange={(e) => change(d.key, 'target', e.target.value)}
                      className="text-right"
                    />
                  </Td>
                  {figures(d.id ? byId.get(d.id) : undefined)}
                  <Td>
                    <SmallButton
                      tone="danger"
                      onClick={() => setDraft((rows) => rows.filter((r) => r.key !== d.key))}
                    >
                      Remove
                    </SmallButton>
                  </Td>
                </Tr>
              ))
            : mix
                .filter((r) => r.group)
                .map((r) => (
                  <Tr key={r.group!.id}>
                    <Td className="max-w-0">
                      <Tag>{r.group!.name}</Tag>
                    </Td>
                    <Td className="text-right">{bpsText(r.targetBps)}</Td>
                    {figures(r)}
                    <Td>
                      {r.status === 'over' && <Tag color="#e03131">Over target</Tag>}
                      {r.status === 'under' && <Tag color="#f08c00">Under target</Tag>}
                      {r.status === 'on' && <Tag color="#2f9e44">On target</Tag>}
                    </Td>
                  </Tr>
                ))}
          {editing && (
            <Tr>
              <Td>
                <SmallButton
                  onClick={() =>
                    setDraft((rows) => [...rows, { key: newDraftKey(), name: '', target: '' }])
                  }
                >
                  + Add group
                </SmallButton>
              </Td>
              <Td />
              <Td />
              <Td />
              <Td />
              <Td />
            </Tr>
          )}
          {!editing && groups.length === 0 && (
            <Tr>
              <Td className="text-muted">
                No groups yet. Add one per fund or theme, like Nifty 50 or Gold.
              </Td>
              <Td />
              <Td />
              <Td />
              <Td />
              <Td />
            </Tr>
          )}
          {ungrouped && (
            <Tr>
              <Td className="text-muted">No group</Td>
              <Td className="text-right text-muted">-</Td>
              {figures(ungrouped)}
              <Td />
            </Tr>
          )}
          <Tr>
            <Td className="font-medium">Total</Td>
            <Td className="text-right text-muted">{bpsText(groupTargetsTotal(groups))}</Td>
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

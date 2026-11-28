import { useState, type FormEvent } from 'react'
import { useLocation, useParams } from 'wouter'
import { SmallButton, Table, Td, Th, Tr } from '../../components/table'
import {
  Button,
  Card,
  Field,
  Loading,
  Money,
  PageHeader,
  SectionTitle,
  Select,
  TextArea,
  TextInput,
} from '../../components/ui'
import {
  useAccounts,
  useAllocationGroups,
  useAllTransactions,
  useHoldings,
  useValuations,
} from '../../data/hooks'
import {
  deleteValuation,
  saveHolding,
  saveValuation,
  setHoldingArchived,
} from '../../data/investments'
import { removeRecord } from '../../data/records'
import { db } from '../../data/db'
import { toFieldErrors } from '../../domain/errors'
import { contributedThrough } from '../../domain/investments'
import { paiseToInput, parseRupees } from '../../domain/money'
import {
  ASSET_CLASSES,
  ASSET_CLASS_LABELS,
  DEFAULT_ASSET_CLASS,
  HOLDING_KINDS,
  HOLDING_KIND_LABELS,
  type AssetClass,
  type Holding,
  type HoldingKind,
} from '../../domain/types'
import { currentMonth, formatMonth } from '../../lib/dates'
import { goBack } from '../../lib/navigation'

const BACK = '/wealth/investments'
/** Kinds that pay a stated interest rate or have a maturity date. */
const FIXED_INCOME: readonly HoldingKind[] = ['fd', 'bond', 'ppf', 'epf']

export function HoldingEditPage() {
  const { id } = useParams<{ id: string }>()
  const holdings = useHoldings()
  const existing = holdings?.find((h) => h.id === id)

  if (!holdings) return <Loading />
  if (id !== 'new' && !existing) {
    return (
      <>
        <PageHeader title="Holding" back={BACK} />
        <p className="text-muted">Holding not found.</p>
      </>
    )
  }
  return <HoldingForm key={id} existing={existing} />
}

function HoldingForm({ existing }: { existing: Holding | undefined }) {
  const [, navigate] = useLocation()
  const accounts = useAccounts()
  const groups = useAllocationGroups()
  const [name, setName] = useState(existing?.name ?? '')
  const [kind, setKind] = useState<HoldingKind>(existing?.kind ?? 'mutual_fund')
  const [assetClass, setAssetClass] = useState<AssetClass>(existing?.assetClass ?? 'equity')
  const [platform, setPlatform] = useState(existing?.platform ?? '')
  const [accountId, setAccountId] = useState(existing?.accountId ?? '')
  const [groupId, setGroupId] = useState(existing?.groupId ?? '')
  const [emergency, setEmergency] = useState(existing?.emergency ?? false)
  const [rate, setRate] = useState(
    existing?.interestRate !== undefined ? String(existing.interestRate / 100) : '',
  )
  const [maturity, setMaturity] = useState(existing?.maturityDate ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function run(action: () => Promise<unknown>) {
    try {
      await action()
      goBack(navigate, BACK)
    } catch (error) {
      setErrors(toFieldErrors(error) ?? { form: (error as Error).message })
    }
  }

  function changeKind(next: HoldingKind) {
    // Follow the usual class for the kind, unless it was changed by hand.
    if (assetClass === DEFAULT_ASSET_CLASS[kind]) setAssetClass(DEFAULT_ASSET_CLASS[next])
    setKind(next)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const percent = rate.trim() === '' ? undefined : Number(rate)
    if (percent !== undefined && (!Number.isFinite(percent) || percent < 0 || percent > 100)) {
      setErrors({ interestRate: 'Enter a rate like 7.1' })
      return
    }
    const fields = {
      name,
      kind,
      assetClass,
      platform: platform.trim() || undefined,
      accountId: accountId || undefined,
      groupId: groupId || undefined,
      emergency: emergency || undefined,
      interestRate: percent === undefined ? undefined : Math.round(percent * 100),
      maturityDate: maturity || undefined,
      notes: notes.trim() || undefined,
    }
    void run(() => saveHolding(fields, existing?.id))
  }

  const fixed = FIXED_INCOME.includes(kind)

  return (
    <>
      <PageHeader title={existing ? 'Edit holding' : 'New holding'} back={BACK} />
      <div className="space-y-8">
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <Field label="Name" error={errors.name}>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="Nifty 50 index fund"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" error={errors.kind}>
              <Select value={kind} onChange={(e) => changeKind(e.target.value as HoldingKind)}>
                {HOLDING_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {HOLDING_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Asset class" error={errors.assetClass}>
              <Select
                value={assetClass}
                onChange={(e) => setAssetClass(e.target.value as AssetClass)}
              >
                {ASSET_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {ASSET_CLASS_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field
            label="Allocation group"
            hint="Which row of the Allocation table it counts towards"
            error={errors.groupId}
          >
            <Select
              value={groupId}
              disabled={emergency}
              onChange={(e) => setGroupId(e.target.value)}
            >
              <option value="">No group</option>
              {groups?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center justify-between gap-4 rounded-xl bg-surface px-4 py-3">
            <span>
              <span className="block text-[15px]">Emergency money</span>
              <span className="block text-[13px] text-muted">
                Counts towards the emergency fund on Home, and is left out of Allocation.
              </span>
            </span>
            <input
              type="checkbox"
              checked={emergency}
              onChange={(e) => setEmergency(e.target.checked)}
              className="h-5 w-5 shrink-0 accent-accent"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Platform" error={errors.platform}>
              <TextInput
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                placeholder="Zerodha, Groww, bank"
              />
            </Field>
            <Field label="Kept in" error={errors.accountId}>
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">-</option>
                {accounts
                  ?.filter((a) => !a.archived || a.id === accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
          {fixed && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Interest rate (% a year)" error={errors.interestRate}>
                <TextInput
                  inputMode="decimal"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="7.1"
                />
              </Field>
              <Field label="Matures on" error={errors.maturityDate}>
                <TextInput
                  type="date"
                  value={maturity}
                  max="9999-12-31"
                  onChange={(e) => setMaturity(e.target.value)}
                />
              </Field>
            </div>
          )}
          <Field label="Notes" error={errors.notes}>
            <TextArea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </Field>
          {errors.form && <p className="text-[14px] text-negative">{errors.form}</p>}
          <div className="flex flex-col gap-2 pt-1">
            <Button type="submit" className="h-12">
              {existing ? 'Save changes' : 'Add holding'}
            </Button>
            {existing && (
              <>
                <Button
                  variant="ghost"
                  onClick={() =>
                    void run(() => setHoldingArchived(existing.id, !existing.archived))
                  }
                >
                  {existing.archived ? 'Restore holding' : 'Archive (sold or closed)'}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (window.confirm(`Delete “${existing.name}” and its history?`)) {
                      void run(() => removeRecord(db.holdings, existing.id))
                    }
                  }}
                >
                  Delete holding
                </Button>
              </>
            )}
          </div>
        </form>

        {existing && <ValuationHistory holding={existing} />}
      </div>
    </>
  )
}

function ValuationHistory({ holding }: { holding: Holding }) {
  const valuations = useValuations()
  const transactions = useAllTransactions()
  const accounts = useAccounts()
  const [month, setMonth] = useState(currentMonth())
  const [invested, setInvested] = useState('')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const history = (valuations ?? [])
    .filter((v) => v.holdingId === holding.id)
    .sort((a, b) => b.month.localeCompare(a.month))
  const accountMap = new Map((accounts ?? []).map((a) => [a.id, a]))
  const suggested = transactions
    ? contributedThrough(holding.id, transactions, accountMap, month)
    : 0

  async function save(e: FormEvent) {
    e.preventDefault()
    const i = parseRupees(invested || '0')
    const v = parseRupees(value)
    if (!/^\d{4}-\d{2}$/.test(month)) return setError('Choose a month.')
    if (v === null || i === null) return setError('Enter the amounts, e.g. 125000')
    setError('')
    await saveValuation(holding.id, month, i, v)
    setInvested('')
    setValue('')
  }

  return (
    <section>
      <SectionTitle>Value by month</SectionTitle>
      <Card className="mb-4 p-4">
        <form onSubmit={(e) => void save(e)} className="space-y-3" noValidate>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Month">
              <TextInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </Field>
            <Field
              label="Invested so far"
              {...(suggested > 0 && { hint: `Tagged transfers: ${paiseToInput(suggested)}` })}
            >
              <TextInput
                inputMode="decimal"
                value={invested}
                onChange={(e) => setInvested(e.target.value)}
              />
            </Field>
            <Field label="Worth at month end">
              <TextInput
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </Field>
          </div>
          {error && <p className="text-[13px] text-negative">{error}</p>}
          <Button type="submit" variant="secondary" className="h-9 text-[14px]">
            Save month
          </Button>
        </form>
      </Card>
      {history.length > 0 && (
        <Table minWidth={520}>
          <thead>
            <tr>
              <Th>Month</Th>
              <Th className="w-32">Invested</Th>
              <Th className="w-32">Worth</Th>
              <Th className="w-28">Gain</Th>
              <Th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {history.map((v) => (
              <Tr key={v.id}>
                <Td>{formatMonth(v.month)}</Td>
                <Td className="text-right">
                  <Money paise={v.invested} />
                </Td>
                <Td className="text-right">
                  <Money paise={v.value} />
                </Td>
                <Td className="text-right">
                  <Money paise={v.value - v.invested} signed />
                </Td>
                <Td className="text-right">
                  <SmallButton tone="danger" onClick={() => void deleteValuation(v.id)}>
                    Delete
                  </SmallButton>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  )
}

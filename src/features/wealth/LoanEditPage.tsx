import { useState, type FormEvent } from 'react'
import { Link, useLocation, useParams } from 'wouter'
import { SmallButton, Table, Td, Th, Tr } from '../../components/table'
import {
  Button,
  Card,
  Field,
  Loading,
  Money,
  PageHeader,
  SectionTitle,
  Segmented,
  Select,
  TextArea,
  TextInput,
} from '../../components/ui'
import { useAccounts, useAllTransactions, useLoanBalances, useLoans } from '../../data/hooks'
import {
  deleteLoanBalance,
  removeLoan,
  saveLoan,
  saveLoanBalance,
  setLoanActive,
} from '../../data/loans'
import { toFieldErrors } from '../../domain/errors'
import { repaymentsOf } from '../../domain/loans'
import { paiseToInput, parseRupees } from '../../domain/money'
import {
  LOAN_KINDS,
  LOAN_KIND_LABELS,
  type Loan,
  type LoanDirection,
  type LoanKind,
} from '../../domain/types'
import { currentMonth, formatMonth, formatShortDate } from '../../lib/dates'
import { goBack } from '../../lib/navigation'

const BACK = '/wealth/loans'

export function LoanEditPage() {
  const { id } = useParams<{ id: string }>()
  const loans = useLoans()
  const existing = loans?.find((l) => l.id === id)
  if (!loans) return <Loading />
  if (id !== 'new' && !existing) {
    return (
      <>
        <PageHeader title="Loan" back={BACK} />
        <p className="text-muted">Loan not found.</p>
      </>
    )
  }
  return <LoanForm key={id} existing={existing} />
}

function LoanForm({ existing }: { existing: Loan | undefined }) {
  const [, navigate] = useLocation()
  const accounts = useAccounts()
  const [direction, setDirection] = useState<LoanDirection>(existing?.direction ?? 'owe')
  const [name, setName] = useState(existing?.name ?? '')
  const [kind, setKind] = useState<LoanKind>(existing?.kind ?? 'personal')
  const [party, setParty] = useState(existing?.party ?? '')
  const [startDate, setStartDate] = useState(existing?.startDate ?? '')
  const [endDate, setEndDate] = useState(existing?.endDate ?? '')
  const [principal, setPrincipal] = useState(
    existing?.principal ? paiseToInput(existing.principal) : '',
  )
  const [rate, setRate] = useState(existing?.rate !== undefined ? String(existing.rate / 100) : '')
  const [emi, setEmi] = useState(existing?.emi ? paiseToInput(existing.emi) : '')
  const [accountId, setAccountId] = useState(existing?.accountId ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const lent = direction === 'owed'

  async function run(action: () => Promise<unknown>) {
    try {
      await action()
      goBack(navigate, BACK)
    } catch (error) {
      setErrors(toFieldErrors(error) ?? { form: (error as Error).message })
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const amount = (text: string, field: string) => {
      if (text.trim() === '') return undefined
      const v = parseRupees(text)
      if (v === null) setErrors({ [field]: 'Enter an amount, e.g. 250000' })
      return v ?? null
    }
    const p = amount(principal, 'principal')
    const m = amount(emi, 'emi')
    if (p === null || m === null) return
    const percent = rate.trim() === '' ? undefined : Number(rate)
    if (percent !== undefined && (!Number.isFinite(percent) || percent < 0 || percent > 100)) {
      setErrors({ rate: 'Enter a rate like 8.5' })
      return
    }
    void run(() =>
      saveLoan(
        {
          name,
          direction,
          kind: lent ? 'friend_family' : kind,
          party: party.trim() || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          principal: p,
          rate: percent === undefined ? undefined : Math.round(percent * 100),
          emi: lent ? undefined : m,
          accountId: !lent && accountId ? accountId : undefined,
          notes: notes.trim() || undefined,
        },
        existing?.id,
      ),
    )
  }

  return (
    <>
      <PageHeader title={existing ? 'Edit loan' : 'New loan'} back={BACK} />
      <div className="space-y-8">
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <Segmented
            value={direction}
            onChange={setDirection}
            options={[
              { value: 'owe', label: 'I owe' },
              { value: 'owed', label: 'I lent' },
            ]}
          />
          <Field label="Name" error={errors.name}>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder={lent ? 'Loan to Rohan' : 'Home loan'}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {!lent && (
              <Field label="Type" error={errors.kind}>
                <Select value={kind} onChange={(e) => setKind(e.target.value as LoanKind)}>
                  {LOAN_KINDS.filter((k) => k !== 'friend_family').map((k) => (
                    <option key={k} value={k}>
                      {LOAN_KIND_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label={lent ? 'Lent to' : 'Lender'} error={errors.party}>
              <TextInput value={party} onChange={(e) => setParty(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={lent ? 'Amount lent' : 'Original amount'} error={errors.principal}>
              <TextInput
                inputMode="decimal"
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
              />
            </Field>
            <Field label="Interest rate (% a year)" error={errors.rate}>
              <TextInput
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Started on" error={errors.startDate}>
              <TextInput
                type="date"
                value={startDate}
                max="9999-12-31"
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label={lent ? 'Due back on' : 'Last EMI on'} error={errors.endDate}>
              <TextInput
                type="date"
                value={endDate}
                max="9999-12-31"
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
          </div>
          {!lent && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="EMI" error={errors.emi}>
                <TextInput
                  inputMode="decimal"
                  value={emi}
                  onChange={(e) => setEmi(e.target.value)}
                />
              </Field>
              <Field label="Paid from" error={errors.accountId}>
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">—</option>
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
          )}
          <Field label="Notes" error={errors.notes}>
            <TextArea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </Field>
          {lent && (
            <p className="px-1 text-[13px] text-muted">
              Log lending and repayments as transfers, not spending or income.
            </p>
          )}
          {errors.form && <p className="text-[14px] text-negative">{errors.form}</p>}
          <div className="flex flex-col gap-2 pt-1">
            <Button type="submit" className="h-12">
              {existing ? 'Save changes' : 'Add loan'}
            </Button>
            {existing && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => void run(() => setLoanActive(existing.id, !existing.active))}
                >
                  {existing.active ? 'Mark as closed' : 'Reopen loan'}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (window.confirm(`Delete “${existing.name}” and its history?`)) {
                      void run(() => removeLoan(existing.id))
                    }
                  }}
                >
                  Delete loan
                </Button>
              </>
            )}
          </div>
        </form>

        {existing && <LoanHistory loan={existing} />}
      </div>
    </>
  )
}

function LoanHistory({ loan }: { loan: Loan }) {
  const balances = useLoanBalances()
  const transactions = useAllTransactions()
  const [month, setMonth] = useState(currentMonth())
  const [outstanding, setOutstanding] = useState('')
  const [error, setError] = useState('')

  const history = (balances ?? [])
    .filter((b) => b.loanId === loan.id)
    .sort((a, b) => b.month.localeCompare(a.month))
  const repayments = transactions ? repaymentsOf(loan.id, transactions) : []
  const paid = repayments.reduce((sum, t) => sum + t.amount, 0)

  async function save(e: FormEvent) {
    e.preventDefault()
    const v = parseRupees(outstanding)
    if (!/^\d{4}-\d{2}$/.test(month)) return setError('Choose a month.')
    if (v === null) return setError('Enter the amount left, e.g. 2500000')
    setError('')
    await saveLoanBalance(loan.id, month, v)
    setOutstanding('')
  }

  return (
    <>
      <section>
        <SectionTitle>Balance by month</SectionTitle>
        <Card className="mb-4 p-4">
          <form
            onSubmit={(e) => void save(e)}
            className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
            noValidate
          >
            <Field label="Month">
              <TextInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </Field>
            <Field label="Left to pay at month end">
              <TextInput
                inputMode="decimal"
                value={outstanding}
                onChange={(e) => setOutstanding(e.target.value)}
              />
            </Field>
            <Button type="submit" variant="secondary" className="h-10 text-[14px]">
              Save month
            </Button>
          </form>
          {error && <p className="mt-2 text-[13px] text-negative">{error}</p>}
        </Card>
        {history.length > 0 && (
          <Table minWidth={420}>
            <thead>
              <tr>
                <Th>Month</Th>
                <Th className="w-40">Outstanding</Th>
                <Th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {history.map((b) => (
                <Tr key={b.id}>
                  <Td>{formatMonth(b.month)}</Td>
                  <Td className="text-right">
                    <Money paise={b.outstanding} />
                  </Td>
                  <Td className="text-right">
                    <SmallButton tone="danger" onClick={() => void deleteLoanBalance(b.id)}>
                      Delete
                    </SmallButton>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section>
        <SectionTitle>Repayments you’ve logged</SectionTitle>
        {repayments.length === 0 ? (
          <p className="px-1 text-[14px] text-muted">
            None yet. Tag a payment as “Loan repayment” under More details when you add or edit it.
          </p>
        ) : (
          <>
            <p className="mb-2 px-1 text-[13px] text-muted">
              {repayments.length} payments, <Money paise={paid} /> in all.
            </p>
            <Table minWidth={420}>
              <tbody>
                {repayments.slice(0, 24).map((t) => (
                  <Tr key={t.id}>
                    <Td className="w-24 text-muted">{formatShortDate(t.date, true)}</Td>
                    <Td className="max-w-0">
                      <Link href={`/transactions/${t.id}`} className="hover:underline">
                        {t.description || t.merchant || 'Repayment'}
                      </Link>
                    </Td>
                    <Td className="w-32 text-right">
                      <Money paise={t.amount} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </section>
    </>
  )
}

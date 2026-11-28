import { useState, type FormEvent } from 'react'
import { Link, useLocation, useParams } from 'wouter'
import { Table, Td, Tr } from '../../components/table'
import {
  Button,
  Field,
  Loading,
  Money,
  PageHeader,
  SectionTitle,
  Select,
  TextArea,
  TextInput,
} from '../../components/ui'
import { useAccounts, useAllTransactions, usePolicies } from '../../data/hooks'
import { removePolicy, savePolicy, setPolicyStatus } from '../../data/policies'
import { toFieldErrors } from '../../domain/errors'
import { paiseToInput, parseRupees } from '../../domain/money'
import { chargeName, matchingCharges, perYear } from '../../domain/recurring'
import { payeeKey } from '../../domain/reconcile'
import {
  BILLING_LABELS,
  BILLING_PERIODS,
  POLICY_KINDS,
  POLICY_KIND_LABELS,
  type BillingPeriod,
  type Policy,
  type PolicyKind,
  type PolicyStatus,
} from '../../domain/types'
import { formatShortDate } from '../../lib/dates'
import { goBack } from '../../lib/navigation'

const BACK = '/wealth/insurance'

export function PolicyEditPage() {
  const { id } = useParams<{ id: string }>()
  const policies = usePolicies()
  const existing = policies?.find((p) => p.id === id)
  if (!policies) return <Loading />
  if (id !== 'new' && !existing) {
    return (
      <>
        <PageHeader title="Policy" back={BACK} />
        <p className="text-muted">Policy not found.</p>
      </>
    )
  }
  return <PolicyForm key={id} existing={existing} />
}

function PolicyForm({ existing }: { existing: Policy | undefined }) {
  const [, navigate] = useLocation()
  const accounts = useAccounts()
  const [name, setName] = useState(existing?.name ?? '')
  const [kind, setKind] = useState<PolicyKind>(existing?.kind ?? 'term')
  const [insurer, setInsurer] = useState(existing?.insurer ?? '')
  const [sumAssured, setSumAssured] = useState(
    existing?.sumAssured ? paiseToInput(existing.sumAssured) : '',
  )
  const [premium, setPremium] = useState(existing ? paiseToInput(existing.premium) : '')
  const [frequency, setFrequency] = useState<BillingPeriod>(existing?.frequency ?? 'yearly')
  const [renewal, setRenewal] = useState(existing?.renewalDate ?? '')
  const [nominee, setNominee] = useState(existing?.nominee ?? '')
  const [accountId, setAccountId] = useState(existing?.accountId ?? '')
  const [payee, setPayee] = useState(existing?.payeeKey ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const premiumPaise = parseRupees(premium || '0') ?? 0

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
    const p = parseRupees(premium)
    const cover = sumAssured.trim() === '' ? undefined : parseRupees(sumAssured)
    if (p === null) return setErrors({ premium: 'Enter an amount, e.g. 18000' })
    if (cover === null) return setErrors({ sumAssured: 'Enter an amount, e.g. 10000000' })
    void run(() =>
      savePolicy(
        {
          name,
          kind,
          insurer,
          premium: p,
          frequency,
          sumAssured: cover,
          renewalDate: renewal || undefined,
          nominee: nominee.trim() || undefined,
          accountId: accountId || undefined,
          payeeKey: payee.trim() ? payeeKey(payee) : payeeKey(insurer) || undefined,
          notes: notes.trim() || undefined,
        },
        existing?.id,
        existing?.status ?? 'active',
      ),
    )
  }

  const setStatus = (status: PolicyStatus) =>
    existing ? run(() => setPolicyStatus(existing.id, status)) : undefined

  return (
    <>
      <PageHeader title={existing ? 'Edit policy' : 'New policy'} back={BACK} />
      <div className="space-y-8">
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <Field label="Name" error={errors.name}>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="Term cover"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" error={errors.kind}>
              <Select value={kind} onChange={(e) => setKind(e.target.value as PolicyKind)}>
                {POLICY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {POLICY_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Insurer" error={errors.insurer}>
              <TextInput value={insurer} onChange={(e) => setInsurer(e.target.value)} />
            </Field>
          </div>
          <Field label="Sum assured (cover)" error={errors.sumAssured}>
            <TextInput
              inputMode="decimal"
              value={sumAssured}
              onChange={(e) => setSumAssured(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Premium"
              error={errors.premium}
              hint={
                premiumPaise > 0
                  ? `${paiseToInput(perYear(premiumPaise, frequency))} a year`
                  : undefined
              }
            >
              <TextInput
                inputMode="decimal"
                value={premium}
                onChange={(e) => setPremium(e.target.value)}
              />
            </Field>
            <Field label="Paid" error={errors.frequency}>
              <Select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as BillingPeriod)}
              >
                {BILLING_PERIODS.map((b) => (
                  <option key={b} value={b}>
                    {BILLING_LABELS[b]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Next renewal" error={errors.renewalDate}>
              <TextInput
                type="date"
                value={renewal}
                max="9999-12-31"
                onChange={(e) => setRenewal(e.target.value)}
              />
            </Field>
            <Field label="Nominee" error={errors.nominee}>
              <TextInput value={nominee} onChange={(e) => setNominee(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Paid from" error={errors.accountId}>
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
            <Field
              label="Looks like this in your history"
              error={errors.payeeKey}
              hint="Finds premium payments. Blank uses the insurer."
            >
              <TextInput value={payee} onChange={(e) => setPayee(e.target.value)} />
            </Field>
          </div>
          <Field label="Notes" error={errors.notes}>
            <TextArea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Policy number (last digits only), where the papers are"
            />
          </Field>
          {errors.form && <p className="text-[14px] text-negative">{errors.form}</p>}
          <div className="flex flex-col gap-2 pt-1">
            <Button type="submit" className="h-12">
              {existing ? 'Save changes' : 'Add policy'}
            </Button>
            {existing && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => void setStatus(existing.status === 'active' ? 'closed' : 'active')}
                >
                  {existing.status === 'active' ? 'Mark as closed' : 'Reactivate'}
                </Button>
                {existing.status === 'active' && (
                  <Button variant="ghost" onClick={() => void setStatus('lapsed')}>
                    Mark as lapsed
                  </Button>
                )}
                <Button
                  variant="danger"
                  onClick={() => {
                    if (window.confirm(`Delete “${existing.name}”?`)) {
                      void run(() => removePolicy(existing.id))
                    }
                  }}
                >
                  Delete policy
                </Button>
              </>
            )}
          </div>
        </form>
        {existing && <Premiums policy={existing} />}
      </div>
    </>
  )
}

function Premiums({ policy }: { policy: Policy }) {
  const transactions = useAllTransactions()
  if (!transactions) return null
  const paid = matchingCharges(policy.payeeKey ?? '', transactions, false)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 12)
  return (
    <section className="space-y-3">
      <SectionTitle>Premiums in your history</SectionTitle>
      {paid.length === 0 ? (
        <p className="px-1 text-[14px] text-muted">
          No payments match this insurer yet. They’re found by the name in your entries.
        </p>
      ) : (
        <Table minWidth={420}>
          <tbody>
            {paid.map((t) => (
              <Tr key={t.id}>
                <Td className="w-24 text-muted">{formatShortDate(t.date, true)}</Td>
                <Td className="max-w-0">
                  <Link href={`/transactions/${t.id}`} className="hover:underline">
                    {chargeName(t) || policy.insurer}
                  </Link>
                </Td>
                <Td className="w-32 text-right">
                  <Money paise={t.amount} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  )
}

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
import { useAccounts, useAllTransactions, useSubscriptions } from '../../data/hooks'
import {
  linkCharges,
  removeSubscription,
  saveSubscription,
  setSubscriptionStatus,
} from '../../data/subscriptions'
import { toFieldErrors } from '../../domain/errors'
import { paiseToInput, parseRupees } from '../../domain/money'
import { chargeName, matchingCharges, perMonth, perYear } from '../../domain/recurring'
import { payeeKey } from '../../domain/reconcile'
import {
  BILLING_LABELS,
  BILLING_PERIODS,
  SUBSCRIPTION_KINDS,
  SUBSCRIPTION_KIND_LABELS,
  type BillingPeriod,
  type Subscription,
  type SubscriptionKind,
} from '../../domain/types'
import { formatShortDate } from '../../lib/dates'
import { goBack } from '../../lib/navigation'

const BACK = '/wealth/subscriptions'

export function SubscriptionEditPage() {
  const { id } = useParams<{ id: string }>()
  const subscriptions = useSubscriptions()
  const existing = subscriptions?.find((s) => s.id === id)
  if (!subscriptions) return <Loading />
  if (id !== 'new' && !existing) {
    return (
      <>
        <PageHeader title="Subscription" back={BACK} />
        <p className="text-muted">Subscription not found.</p>
      </>
    )
  }
  return <SubscriptionForm key={id} existing={existing} />
}

function SubscriptionForm({ existing }: { existing: Subscription | undefined }) {
  const [, navigate] = useLocation()
  const accounts = useAccounts()
  const [service, setService] = useState(existing?.service ?? '')
  const [kind, setKind] = useState<SubscriptionKind>(existing?.kind ?? 'entertainment')
  const [cost, setCost] = useState(existing ? paiseToInput(existing.cost) : '')
  const [billing, setBilling] = useState<BillingPeriod>(existing?.billing ?? 'monthly')
  const [renewal, setRenewal] = useState(existing?.nextRenewal ?? '')
  const [accountId, setAccountId] = useState(existing?.accountId ?? '')
  const [payee, setPayee] = useState(existing?.payeeKey ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const amount = parseRupees(cost || '0') ?? 0

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
    const value = parseRupees(cost)
    if (value === null) {
      setErrors({ cost: 'Enter an amount, e.g. 649' })
      return
    }
    void run(() =>
      saveSubscription(
        {
          service,
          kind,
          cost: value,
          billing,
          nextRenewal: renewal || undefined,
          accountId: accountId || undefined,
          // Charges are matched on the service name unless told otherwise.
          payeeKey: payee.trim() ? payeeKey(payee) : payeeKey(service) || undefined,
          notes: notes.trim() || undefined,
        },
        existing?.id,
        existing?.status ?? 'active',
      ),
    )
  }

  return (
    <>
      <PageHeader title={existing ? 'Edit subscription' : 'New subscription'} back={BACK} />
      <div className="space-y-8">
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <Field label="Service" error={errors.service}>
            <TextInput
              value={service}
              onChange={(e) => setService(e.target.value)}
              maxLength={80}
              placeholder="Netflix"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" error={errors.kind}>
              <Select value={kind} onChange={(e) => setKind(e.target.value as SubscriptionKind)}>
                {SUBSCRIPTION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {SUBSCRIPTION_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Billed" error={errors.billing}>
              <Select value={billing} onChange={(e) => setBilling(e.target.value as BillingPeriod)}>
                {BILLING_PERIODS.map((b) => (
                  <option key={b} value={b}>
                    {BILLING_LABELS[b]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field
            label="Cost each time"
            error={errors.cost}
            hint={
              amount > 0
                ? `${paiseToInput(perMonth(amount, billing))} a month, ${paiseToInput(perYear(amount, billing))} a year`
                : undefined
            }
          >
            <TextInput inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Next renewal" error={errors.nextRenewal}>
              <TextInput
                type="date"
                value={renewal}
                max="9999-12-31"
                onChange={(e) => setRenewal(e.target.value)}
              />
            </Field>
            <Field label="Paid with" error={errors.accountId}>
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
          <Field
            label="Looks like this in your history"
            error={errors.payeeKey}
            hint="Used to find its charges. Leave blank to use the service name."
          >
            <TextInput
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              placeholder="netflix"
            />
          </Field>
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
              {existing ? 'Save changes' : 'Add subscription'}
            </Button>
            {existing && (
              <>
                <Button
                  variant="ghost"
                  onClick={() =>
                    void run(() =>
                      setSubscriptionStatus(
                        existing.id,
                        existing.status === 'cancelled' ? 'active' : 'cancelled',
                      ),
                    )
                  }
                >
                  {existing.status === 'cancelled' ? 'Reactivate' : 'Mark as cancelled'}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (window.confirm(`Delete “${existing.service}”?`)) {
                      void run(() => removeSubscription(existing.id))
                    }
                  }}
                >
                  Delete subscription
                </Button>
              </>
            )}
          </div>
        </form>
        {existing && <Charges subscription={existing} />}
      </div>
    </>
  )
}

function Charges({ subscription }: { subscription: Subscription }) {
  const transactions = useAllTransactions()
  if (!transactions) return null
  const linked = transactions
    .filter((t) => t.subscriptionId === subscription.id)
    .sort((a, b) => b.date.localeCompare(a.date))
  const candidates = matchingCharges(subscription.payeeKey ?? '', transactions)
  const total = linked.reduce((sum, t) => sum + t.amount, 0)

  return (
    <section className="space-y-3">
      <SectionTitle>Charges</SectionTitle>
      {candidates.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <p className="min-w-0 flex-1 text-[14px]">
            {candidates.length} payment{candidates.length === 1 ? '' : 's'} in your history look
            like this subscription.
          </p>
          <Button
            variant="secondary"
            className="h-9 text-[14px]"
            onClick={() =>
              void linkCharges(
                subscription.id,
                candidates.map((t) => t.id),
              )
            }
          >
            Link them
          </Button>
        </div>
      )}
      {linked.length === 0 ? (
        <p className="px-1 text-[14px] text-muted">No charges linked yet.</p>
      ) : (
        <>
          <p className="px-1 text-[13px] text-muted">
            {linked.length} charge{linked.length === 1 ? '' : 's'}, <Money paise={total} /> in all.
          </p>
          <Table minWidth={420}>
            <tbody>
              {linked.slice(0, 24).map((t) => (
                <Tr key={t.id}>
                  <Td className="w-24 text-muted">{formatShortDate(t.date, true)}</Td>
                  <Td className="max-w-0">
                    <Link href={`/transactions/${t.id}`} className="hover:underline">
                      {chargeName(t) || subscription.service}
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
  )
}

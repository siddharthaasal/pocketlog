import { useMemo } from 'react'
import { Link, useLocation } from 'wouter'
import {
  CalendarGlyph,
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
import { EmptyState, Loading, Money } from '../../components/ui'
import { useAccounts, useAllTransactions, useSubscriptions } from '../../data/hooks'
import {
  addFromSuggestion,
  ignoreRecurring,
  setSubscriptionStatus,
  useIgnoredRecurring,
} from '../../data/subscriptions'
import {
  knownPayees,
  perMonth,
  perYear,
  recurringTotals,
  suggestRecurring,
} from '../../domain/recurring'
import {
  BILLING_LABELS,
  SUBSCRIPTION_KIND_LABELS,
  type SubscriptionStatus,
} from '../../domain/types'
import { cx } from '../../lib/cx'
import { formatShortDate, todayISO } from '../../lib/dates'
import { Stat, WealthShell } from './WealthShell'

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'Active',
  cancel: 'To cancel',
  cancelled: 'Cancelled',
}
const STATUS_COLORS: Record<SubscriptionStatus, string> = {
  active: '#2f9e44',
  cancel: '#f08c00',
  cancelled: '#868e96',
}

export function SubscriptionsPage() {
  const subscriptions = useSubscriptions()
  const accounts = useAccounts()
  const transactions = useAllTransactions()
  const ignoredKeys = useIgnoredRecurring()
  const [, navigate] = useLocation()
  const today = todayISO()

  const suggestions = useMemo(
    () =>
      subscriptions && transactions && ignoredKeys
        ? suggestRecurring(
            transactions,
            new Set([...knownPayees(subscriptions), ...ignoredKeys]),
            today,
          )
        : [],
    [subscriptions, transactions, ignoredKeys, today],
  )

  if (!subscriptions || !accounts || !transactions) {
    return (
      <WealthShell>
        <Loading />
      </WealthShell>
    )
  }
  const totals = recurringTotals(subscriptions)
  const next = subscriptions
    .filter((s) => s.status !== 'cancelled' && s.nextRenewal && s.nextRenewal >= today)
    .sort((a, b) => a.nextRenewal!.localeCompare(b.nextRenewal!))[0]
  const accountName = (id: string | undefined) => accounts.find((a) => a.id === id)?.name ?? '—'

  return (
    <WealthShell
      action={
        <Link
          href="/wealth/subscriptions/new"
          className="inline-flex h-9 items-center rounded-lg bg-accent px-4 text-[14px] font-medium text-accent-fg hover:opacity-90"
        >
          Add subscription
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Per month">
          <Money paise={totals.perMonth} />
        </Stat>
        <Stat label="Per year">
          <Money paise={totals.perYear} />
        </Stat>
        <Stat
          label="Marked to cancel"
          hint={
            totals.cancelPerMonth > 0
              ? `Saves ${formatPerYear(totals.cancelPerMonth * 12)} a year`
              : undefined
          }
        >
          <Money paise={totals.cancelPerMonth} />
        </Stat>
        <Stat label="Next renewal" hint={next ? next.service : undefined}>
          {next ? formatShortDate(next.nextRenewal!) : '—'}
        </Stat>
      </div>

      {suggestions.length > 0 && (
        <section className="space-y-2">
          <div className="px-1">
            <h2 className="text-[17px] font-semibold tracking-tight">Looks like subscriptions</h2>
            <p className="text-[13px] text-muted">
              Payments that repeat on a schedule in your history. Add one to track its renewal.
            </p>
          </div>
          <Table minWidth={720}>
            <thead>
              <tr>
                <Th icon={<TextGlyph />}>Payee</Th>
                <Th className="w-28" icon={<NumberGlyph />}>
                  Amount
                </Th>
                <Th className="w-28" icon={<SelectGlyph />}>
                  Repeats
                </Th>
                <Th className="w-24" icon={<NumberGlyph />}>
                  Seen
                </Th>
                <Th className="w-28" icon={<CalendarGlyph />}>
                  Next
                </Th>
                <Th className="w-36" />
              </tr>
            </thead>
            <tbody>
              {suggestions.map((s) => (
                <Tr key={s.payeeKey}>
                  <Td className="max-w-0">{s.name}</Td>
                  <Td className="text-right">
                    <Money paise={s.cost} />
                  </Td>
                  <Td>
                    <Tag>{BILLING_LABELS[s.billing]}</Tag>
                  </Td>
                  <Td className="text-muted">{s.count} times</Td>
                  <Td className="text-muted">{formatShortDate(s.nextRenewal)}</Td>
                  <Td className="overflow-visible text-right">
                    <SmallButton onClick={() => void ignoreRecurring(s.payeeKey)}>
                      Not one
                    </SmallButton>
                    <SmallButton tone="primary" onClick={() => void addFromSuggestion(s)}>
                      Add
                    </SmallButton>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </section>
      )}

      {subscriptions.length === 0 ? (
        suggestions.length === 0 && (
          <EmptyState title="No subscriptions yet.">
            <Link
              href="/wealth/subscriptions/new"
              className="inline-flex h-10 items-center rounded-lg bg-accent px-5 text-[14.5px] font-medium text-accent-fg"
            >
              Add a subscription
            </Link>
          </EmptyState>
        )
      ) : (
        <Table minWidth={960}>
          <thead>
            <tr>
              <Th icon={<TextGlyph />}>Service</Th>
              <Th className="w-32" icon={<SelectGlyph />}>
                Type
              </Th>
              <Th className="w-28" icon={<NumberGlyph />}>
                Cost
              </Th>
              <Th className="w-24" icon={<SelectGlyph />}>
                Billing
              </Th>
              <Th className="w-28" icon={<NumberGlyph />}>
                Per month
              </Th>
              <Th className="w-28" icon={<NumberGlyph />}>
                Per year
              </Th>
              <Th className="w-28" icon={<CalendarGlyph />}>
                Renews
              </Th>
              <Th className="w-32" icon={<SelectGlyph />}>
                Paid with
              </Th>
              <Th className="w-32" icon={<SelectGlyph />}>
                Status
              </Th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((s) => (
              <Tr key={s.id} onClick={() => navigate(`/wealth/subscriptions/${s.id}`)}>
                <Td
                  className={cx('max-w-0', s.status === 'cancelled' && 'text-muted line-through')}
                >
                  {s.service}
                </Td>
                <Td>
                  <Tag>{SUBSCRIPTION_KIND_LABELS[s.kind]}</Tag>
                </Td>
                <Td className="text-right">
                  <Money paise={s.cost} />
                </Td>
                <Td className="text-muted">{BILLING_LABELS[s.billing]}</Td>
                <Td className="text-right">
                  <Money paise={perMonth(s.cost, s.billing)} />
                </Td>
                <Td className="text-right">
                  <Money paise={perYear(s.cost, s.billing)} />
                </Td>
                <Td className="text-muted">
                  {s.nextRenewal && s.status !== 'cancelled' ? formatShortDate(s.nextRenewal) : '—'}
                </Td>
                <Td className="max-w-0 text-muted">{accountName(s.accountId)}</Td>
                <Td className="overflow-visible" onClick={(e) => e.stopPropagation()}>
                  <TagSelect
                    color={STATUS_COLORS[s.status]}
                    aria-label={`Status of ${s.service}`}
                    value={s.status}
                    onChange={(e) =>
                      void setSubscriptionStatus(s.id, e.target.value as SubscriptionStatus)
                    }
                  >
                    {(Object.keys(STATUS_LABELS) as SubscriptionStatus[]).map((k) => (
                      <option key={k} value={k}>
                        {STATUS_LABELS[k]}
                      </option>
                    ))}
                  </TagSelect>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </WealthShell>
  )
}

const formatPerYear = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`

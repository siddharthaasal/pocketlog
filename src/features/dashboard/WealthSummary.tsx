import { useMemo } from 'react'
import { Link } from 'wouter'
import { ChevronRightIcon } from '../../components/icons'
import { Card, Money, SectionTitle } from '../../components/ui'
import {
  useAccountBalances,
  useAccounts,
  useAllTransactions,
  useBalances,
  useHoldings,
  useLoans,
  usePolicies,
  useSnapshots,
  useSubscriptions,
  useValuations,
} from '../../data/hooks'
import { findDrift } from '../../domain/balances'
import { allocation, DEFAULT_TARGETS, holdingRows } from '../../domain/investments'
import { changeOver, savingsRate, snapshotRows } from '../../domain/networth'
import { perYear, renewalState } from '../../domain/recurring'
import { cx } from '../../lib/cx'
import { currentMonth, formatMonth, formatShortDate, todayISO } from '../../lib/dates'

const tone = (n: number) => (n > 0 ? 'text-positive' : n < 0 ? 'text-negative' : undefined)

interface Coming {
  key: string
  label: string
  date: string
  paise: number
  overdue: boolean
}

/** The tracker's Summary sheet, on the home screen: where you stand, and what is due soon. */
export function WealthSummary() {
  const snapshots = useSnapshots()
  const transactions = useAllTransactions()
  const holdings = useHoldings()
  const valuations = useValuations()
  const loans = useLoans()
  const subscriptions = useSubscriptions()
  const policies = usePolicies()
  const accounts = useAccounts()
  const checkpoints = useAccountBalances()
  const balances = useBalances()
  const today = todayISO()

  const view = useMemo(() => {
    if (
      !snapshots ||
      !transactions ||
      !holdings ||
      !valuations ||
      !loans ||
      !subscriptions ||
      !policies ||
      !accounts ||
      !checkpoints ||
      !balances
    ) {
      return null
    }
    const rows = snapshotRows(snapshots)
    const latest = rows[rows.length - 1]
    const rate = savingsRate(transactions, currentMonth(), 12)

    const active = holdingRows(holdings, valuations).filter((r) => !r.holding.archived && r.asOf)
    const cash = accounts
      .filter((a) => !a.archived && ['bank', 'cash', 'wallet'].includes(a.type))
      .reduce((sum, a) => sum + (balances.get(a.id) ?? 0), 0)
    const mix = allocation(active, cash, DEFAULT_TARGETS)
    const equity = mix.rows.find((r) => r.assetClass === 'equity')?.actualBps ?? null

    const coming: Coming[] = [
      ...subscriptions
        .filter((s) => s.status !== 'cancelled' && s.nextRenewal)
        .map((s) => ({
          key: `s-${s.id}`,
          label: s.service,
          date: s.nextRenewal!,
          paise: s.cost,
          overdue: false,
        })),
      ...policies
        .filter((p) => p.status === 'active' && p.renewalDate)
        .map((p) => ({
          key: `p-${p.id}`,
          label: `${p.name} (${p.insurer})`,
          date: p.renewalDate!,
          paise: p.premium,
          overdue: renewalState(p.renewalDate, today) === 'overdue',
        })),
    ]
      .filter((c) => c.overdue || renewalState(c.date, today, 14) === 'soon')
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4)

    const drift = findDrift(accounts, transactions, checkpoints)
    const hasAnything =
      rows.length > 0 ||
      holdings.length > 0 ||
      loans.length > 0 ||
      subscriptions.length > 0 ||
      policies.length > 0
    return {
      hasAnything,
      latest,
      year: changeOver(rows, 12),
      rate,
      equity,
      coming,
      drift: drift.length,
      yearlyBills: subscriptions.reduce(
        (sum, s) => (s.status === 'cancelled' ? sum : sum + perYear(s.cost, s.billing)),
        0,
      ),
    }
  }, [
    snapshots,
    transactions,
    holdings,
    valuations,
    loans,
    subscriptions,
    policies,
    accounts,
    checkpoints,
    balances,
    today,
  ])

  if (!view) return null

  if (!view.hasAnything) {
    return (
      <Link
        href="/wealth"
        className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:bg-surface-2/60"
      >
        <span className="flex-1 text-[15px]">Track net worth, investments and loans</span>
        <ChevronRightIcon width={18} height={18} className="text-muted" />
      </Link>
    )
  }

  const { latest } = view
  return (
    <section>
      <SectionTitle
        action={
          <Link href="/wealth" className="text-[14px] text-accent">
            Open
          </Link>
        }
      >
        Wealth
      </SectionTitle>
      <Card className="p-5">
        <div className="text-[13px] font-medium text-muted">
          Net worth{latest ? ` · ${formatMonth(latest.month)}` : ''}
        </div>
        <div className="mt-1 text-[32px] leading-none font-semibold tracking-tight">
          {latest ? <Money paise={latest.summary.netWorth} /> : '—'}
        </div>
        {!latest && (
          <Link href="/wealth/net-worth" className="mt-2 inline-block text-[14px] text-accent">
            Close your first month
          </Link>
        )}
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
          <Figure label="This month">
            {latest?.change == null ? (
              '—'
            ) : (
              <Money paise={latest.change} signed className={tone(latest.change)} />
            )}
          </Figure>
          <Figure label="12 months">
            {view.year === null ? (
              '—'
            ) : (
              <Money paise={view.year} signed className={tone(view.year)} />
            )}
          </Figure>
          <Figure label="Savings rate">
            {view.rate.rate === null
              ? '—'
              : view.rate.rate < -1
                ? 'Below −100%'
                : `${Math.round(view.rate.rate * 100)}%`}
          </Figure>
          <Figure label="In equity">
            {view.equity === null ? '—' : `${Math.round(view.equity / 100)}%`}
          </Figure>
        </div>

        {(view.coming.length > 0 || view.drift > 0) && (
          <div className="mt-5 space-y-2 border-t border-border pt-4">
            {view.coming.map((c) => (
              <div key={c.key} className="flex items-baseline gap-3 text-[14px]">
                <span
                  className={cx(
                    'w-14 shrink-0 text-[13px]',
                    c.overdue ? 'text-negative' : 'text-muted',
                  )}
                >
                  {c.overdue ? 'Overdue' : formatShortDate(c.date)}
                </span>
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
                <Money paise={c.paise} className="text-muted" />
              </div>
            ))}
            {view.drift > 0 && (
              <Link href="/settings/accounts" className="block text-[14px] text-negative">
                {view.drift} account{view.drift === 1 ? '' : 's'} differ from the bank statement
              </Link>
            )}
          </div>
        )}
      </Card>
    </section>
  )
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="text-[16px] font-medium tabular-nums">{children}</div>
    </div>
  )
}

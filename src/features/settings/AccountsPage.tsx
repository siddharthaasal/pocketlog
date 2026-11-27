import { Link } from 'wouter'
import { Card, Loading, Money, PageHeader, SectionTitle } from '../../components/ui'
import { useAccountBalances, useAccounts, useAllTransactions, useBalances } from '../../data/hooks'
import { findDrift } from '../../domain/balances'
import { formatINR } from '../../domain/money'
import { formatShortDate } from '../../lib/dates'
import { useMemo } from 'react'
import { ACCOUNT_TYPE_LABELS, type Account } from '../../domain/types'
import { SettingsRow } from './SettingsList'

export function AccountsPage() {
  const accounts = useAccounts()
  const balances = useBalances()
  const transactions = useAllTransactions()
  const checkpoints = useAccountBalances()
  const drift = useMemo(
    () =>
      new Map(
        accounts && transactions && checkpoints
          ? findDrift(accounts, transactions, checkpoints).map((d) => [d.accountId, d])
          : [],
      ),
    [accounts, transactions, checkpoints],
  )
  const active = accounts?.filter((a) => !a.archived) ?? []
  const archived = accounts?.filter((a) => a.archived) ?? []

  const row = (a: Account, muted = false) => (
    <SettingsRow
      key={a.id}
      href={`/settings/accounts/${a.id}`}
      title={
        <span className={muted ? 'text-muted' : undefined}>
          {a.name}
          {a.isDefault && <span className="ml-2 text-[13px] text-accent">Default</span>}
          <span className="block text-[13px] text-muted">
            {[ACCOUNT_TYPE_LABELS[a.type], a.institution, a.last4 && `••${a.last4}`]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {drift.get(a.id) && (
            <span className="block text-[13px] whitespace-normal text-negative">
              Bank said {formatINR(drift.get(a.id)!.statement)} on{' '}
              {formatShortDate(drift.get(a.id)!.date, true)}; PocketLog works out{' '}
              {formatINR(drift.get(a.id)!.computed)}. An entry may be missing.
            </span>
          )}
        </span>
      }
      detail={balances && <Money paise={balances.get(a.id) ?? 0} />}
    />
  )

  return (
    <>
      <PageHeader
        title="Accounts"
        back="/settings"
        action={
          <Link href="/settings/accounts/new" className="text-[15px] font-medium text-accent">
            New
          </Link>
        }
      />
      {!accounts ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          <Card className="divide-y divide-border overflow-hidden">
            {active.map((a) => row(a))}
          </Card>
          {archived.length > 0 && (
            <section>
              <SectionTitle>Archived</SectionTitle>
              <Card className="divide-y divide-border overflow-hidden">
                {archived.map((a) => row(a, true))}
              </Card>
            </section>
          )}
        </div>
      )}
    </>
  )
}

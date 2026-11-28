import { useMemo, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { NumberGlyph, SelectGlyph, Table, Tag, TextGlyph, Td, Th, Tr } from '../../components/table'
import { Loading, Money, PageHeader } from '../../components/ui'
import { useAccountBalances, useAccounts, useAllTransactions, useBalances } from '../../data/hooks'
import { findDrift } from '../../domain/balances'
import { formatINR } from '../../domain/money'
import { ACCOUNT_TYPE_LABELS, type Account } from '../../domain/types'
import { cx } from '../../lib/cx'
import { formatShortDate } from '../../lib/dates'

export function AccountsPage() {
  const [, navigate] = useLocation()
  const accounts = useAccounts()
  const balances = useBalances()
  const transactions = useAllTransactions()
  const checkpoints = useAccountBalances()
  const [showArchived, setShowArchived] = useState(false)
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
  const shown = showArchived ? [...active, ...archived] : active
  const differing = active.filter((a) => drift.has(a.id))

  const row = (a: Account) => {
    const d = drift.get(a.id)
    return (
      <Tr key={a.id} onClick={() => navigate(`/accounts/${a.id}`)}>
        <Td className={cx('max-w-0', a.archived && 'text-muted')}>
          <span className="flex items-center gap-2">
            <Link
              href={`/accounts/${a.id}`}
              className="truncate hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {a.name}
            </Link>
            {a.isDefault && (
              <span className="shrink-0">
                <Tag color="#0075de">Default</Tag>
              </span>
            )}
          </span>
        </Td>
        <Td>
          <Tag>{ACCOUNT_TYPE_LABELS[a.type]}</Tag>
        </Td>
        <Td className="max-w-0 text-muted">
          {[a.institution, a.last4 && `••${a.last4}`].filter(Boolean).join(' · ') || '-'}
        </Td>
        <Td className="text-right">
          <Money paise={balances?.get(a.id) ?? 0} />
        </Td>
        {differing.length > 0 && (
          <Td>
            {d && (
              <Tag
                color="#e03131"
                title={`Bank said ${formatINR(d.statement)} on ${formatShortDate(d.date, true)}; PocketLog works out ${formatINR(d.computed)}.`}
              >
                Differs from bank
              </Tag>
            )}
          </Td>
        )}
      </Tr>
    )
  }

  return (
    <>
      <PageHeader
        title="Accounts"
        action={
          <Link
            href="/accounts/new"
            className="inline-flex h-9 items-center rounded-lg bg-accent px-4 text-[14px] font-medium whitespace-nowrap text-accent-fg hover:opacity-90"
          >
            Add account
          </Link>
        }
      />
      {!accounts ? (
        <Loading />
      ) : (
        <div className="space-y-2">
          {differing.length > 0 && (
            <div className="space-y-1 px-1 text-[13px] text-negative">
              {differing.map((a) => {
                const d = drift.get(a.id)!
                return (
                  <p key={a.id}>
                    {a.name}: the bank said {formatINR(d.statement)} on{' '}
                    {formatShortDate(d.date, true)}; PocketLog works out {formatINR(d.computed)}. An
                    entry may be missing.
                  </p>
                )
              })}
            </div>
          )}
          <Table minWidth={640}>
            <thead>
              <tr>
                <Th icon={<TextGlyph />}>Account</Th>
                <Th className="w-40" icon={<SelectGlyph />}>
                  Type
                </Th>
                <Th className="w-40" icon={<TextGlyph />}>
                  Bank
                </Th>
                <Th className="w-32" icon={<NumberGlyph />}>
                  Balance
                </Th>
                {differing.length > 0 && (
                  <Th className="w-40" icon={<SelectGlyph />}>
                    Status
                  </Th>
                )}
              </tr>
            </thead>
            <tbody>{shown.map(row)}</tbody>
          </Table>
          {archived.length > 0 && (
            <button
              type="button"
              className="px-1 text-[13px] text-muted underline"
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? 'Hide' : 'Show'} {archived.length} archived
            </button>
          )}
        </div>
      )}
    </>
  )
}

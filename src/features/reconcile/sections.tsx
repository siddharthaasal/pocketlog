import { useState } from 'react'
import { Link } from 'wouter'
import { EmptyState, Money } from '../../components/ui'
import {
  addStatementEntries,
  applyStatementAmount,
  linkTransactions,
  removeIgnoredPayee,
} from '../../data/reconcile'
import { deleteTransaction } from '../../data/repo'
import { extractPayee, payeeKey, type StatementRow } from '../../domain/reconcile'
import type { Account, Category, Transaction } from '../../domain/types'
import { formatShortDate } from '../../lib/dates'
import { defaultDraft, toEntry, type Plan } from './plan'
import { SmallButton, Table, Tag, Td, Th, Tr } from './table'

const signed = (t: Pick<Transaction, 'type' | 'amount'>) =>
  t.type === 'expense' ? -t.amount : t.amount
const amountCell = 'text-right whitespace-nowrap'

function CategoryTag({ t, categories }: { t: Transaction; categories: readonly Category[] }) {
  if (t.type === 'transfer') return <Tag>⇄ Transfer</Tag>
  const c = categories.find((x) => x.id === t.categoryId)
  return (
    <Tag color={c?.color}>
      {c?.icon} {c?.name ?? '—'}
    </Tag>
  )
}

export function ConflictsList({
  conflicts,
  categories,
  accounts,
  transactions,
}: {
  conflicts: Plan['conflicts']
  categories: Category[]
  accounts: Account[]
  transactions: Transaction[]
}) {
  const [error, setError] = useState<string | null>(null)
  if (conflicts.length === 0) return <EmptyState title="No amount differences. 🎉" />

  async function addAsNew(c: Plan['conflicts'][number]) {
    const item = { id: c.row.key, accountId: c.accountId, row: c.row }
    const entry = toEntry(item, defaultDraft(item, transactions, categories))
    if (!entry) return setError('Pick a category for this one in the Missing tab first.')
    try {
      await addStatementEntries([entry])
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="space-y-2">
      <p className="px-1 text-[13px] text-muted">
        Same day and a similar payee or amount, but the amounts disagree. Which one is right?
      </p>
      {error && (
        <p role="alert" className="px-1 text-[13px] text-negative">
          {error}
        </p>
      )}
      <Table minWidth={900}>
        <thead>
          <tr>
            <Th className="w-20">Date</Th>
            <Th>Bank says</Th>
            <Th className="w-28 text-right">Bank</Th>
            <Th>PocketLog has</Th>
            <Th className="w-28 text-right">PocketLog</Th>
            <Th className="w-28 text-right">Gap</Th>
            <Th className="w-52" />
          </tr>
        </thead>
        <tbody>
          {conflicts.map((c) => (
            <Tr key={c.row.key}>
              <Td className="whitespace-nowrap text-muted">{formatShortDate(c.row.date)}</Td>
              <Td className="max-w-0">
                <div className="truncate" title={c.row.narration}>
                  {extractPayee(c.row.narration)}
                </div>
                <div className="text-[12px] text-muted">
                  {accounts.find((a) => a.id === c.accountId)?.name}
                </div>
              </Td>
              <Td className={amountCell}>
                <Money paise={c.row.direction === 'out' ? -c.row.amount : c.row.amount} />
              </Td>
              <Td className="max-w-0">
                <div className="truncate">{c.tx.description || c.tx.merchant}</div>
                <CategoryTag t={c.tx} categories={categories} />
              </Td>
              <Td className={amountCell}>
                <Money paise={signed(c.tx)} />
              </Td>
              <Td className={`${amountCell} font-medium text-negative`}>
                {c.difference > 0 ? '+' : '−'}
                <Money paise={Math.abs(c.difference)} />
              </Td>
              <Td className="text-right whitespace-nowrap">
                <SmallButton
                  title="These are two different payments: add the bank row as a new entry"
                  onClick={() => void addAsNew(c)}
                >
                  Not the same
                </SmallButton>
                <SmallButton
                  title="Your amount is right: remember this match and stop flagging it"
                  onClick={() => void linkTransactions([{ id: c.tx.id, bankRef: c.row.key }])}
                >
                  Keep mine
                </SmallButton>
                <SmallButton
                  tone="primary"
                  title="Change your entry to the bank’s amount"
                  onClick={() => void applyStatementAmount(c.tx.id, c.row.amount, c.row.key)}
                >
                  Use bank
                </SmallButton>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  )
}

export function MatchedList({
  matched,
  categories,
  accountName,
  unlinked,
  onRemember,
}: {
  matched: Plan['matched']
  categories: Category[]
  accountName: (id: string) => string
  unlinked: number
  onRemember: () => void
}) {
  if (matched.length === 0) return <EmptyState title="Nothing matched yet." />
  return (
    <div className="space-y-2">
      {unlinked > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <SmallButton onClick={onRemember}>Remember {unlinked} matches</SmallButton>
          <span className="text-[12px] text-muted">
            So later edits to an amount or date don’t break them.
          </span>
        </div>
      )}
      <Table minWidth={720}>
        <thead>
          <tr>
            <Th className="w-20">Date</Th>
            <Th>Name</Th>
            <Th className="w-28 text-right">Amount</Th>
            <Th className="w-52">Category</Th>
            <Th className="w-24">Account</Th>
            <Th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {matched.map((m) => (
            <Tr key={`${m.row.key}-${m.tx.id}`}>
              <Td className="whitespace-nowrap text-muted">{formatShortDate(m.row.date)}</Td>
              <Td className="max-w-0">
                <div className="truncate">{m.tx.description || extractPayee(m.row.narration)}</div>
                {m.row.date !== m.tx.date && (
                  <div className="text-[12px] text-muted">
                    logged on {formatShortDate(m.tx.date)}
                  </div>
                )}
              </Td>
              <Td className={amountCell}>
                <Money paise={m.row.direction === 'out' ? -m.row.amount : m.row.amount} />
              </Td>
              <Td>
                <CategoryTag t={m.tx} categories={categories} />
              </Td>
              <Td>
                <Tag>{accountName(m.accountId)}</Tag>
              </Td>
              <Td className="text-positive" aria-label="Matched">
                ✓
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  )
}

export function ExtraList({
  extra,
  categories,
  accounts,
}: {
  extra: Transaction[]
  categories: Category[]
  accounts: Account[]
}) {
  if (extra.length === 0) {
    return <EmptyState title="Everything in PocketLog for this period is on the statement." />
  }
  return (
    <div className="space-y-2">
      <p className="px-1 text-[13px] text-muted">
        In PocketLog for this period but not on the statement: maybe cash, another account, a wrong
        date or amount, or a duplicate.
      </p>
      <Table minWidth={720}>
        <thead>
          <tr>
            <Th className="w-20">Date</Th>
            <Th>Name</Th>
            <Th className="w-28 text-right">Amount</Th>
            <Th className="w-52">Category</Th>
            <Th className="w-24">Account</Th>
            <Th className="w-32" />
          </tr>
        </thead>
        <tbody>
          {extra.map((t) => (
            <Tr key={t.id}>
              <Td className="whitespace-nowrap text-muted">{formatShortDate(t.date)}</Td>
              <Td className="max-w-0">
                <div className="truncate">{t.description || t.merchant || '—'}</div>
              </Td>
              <Td className={amountCell}>
                <Money paise={signed(t)} />
              </Td>
              <Td>
                <CategoryTag t={t} categories={categories} />
              </Td>
              <Td>
                <Tag>{accounts.find((a) => a.id === t.accountId)?.name ?? '?'}</Tag>
              </Td>
              <Td className="text-right whitespace-nowrap">
                <Link
                  href={`/transactions/${t.id}`}
                  className="inline-flex h-7 items-center rounded-md px-2 text-[13px] text-accent hover:bg-surface-2"
                >
                  Edit
                </Link>
                <SmallButton
                  tone="danger"
                  onClick={() => {
                    if (
                      window.confirm(`Delete “${t.description || t.merchant || 'this entry'}”?`)
                    ) {
                      void deleteTransaction(t.id)
                    }
                  }}
                >
                  Delete
                </SmallButton>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  )
}

export function IgnoredList({ ignored }: { ignored: (StatementRow & { accountId: string })[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="px-1 text-[13px] text-muted underline"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Hide' : 'Show'} {ignored.length} ignored rows
      </button>
      {open && (
        <Table minWidth={560}>
          <thead>
            <tr>
              <Th className="w-20">Date</Th>
              <Th>Name</Th>
              <Th className="w-28 text-right">Amount</Th>
              <Th className="w-36" />
            </tr>
          </thead>
          <tbody>
            {ignored.map((r) => (
              <Tr key={r.key}>
                <Td className="whitespace-nowrap text-muted">{formatShortDate(r.date)}</Td>
                <Td className="max-w-0">
                  <div className="truncate" title={r.narration}>
                    {extractPayee(r.narration)}
                  </div>
                </Td>
                <Td className={amountCell}>
                  <Money paise={r.direction === 'out' ? -r.amount : r.amount} />
                </Td>
                <Td className="text-right">
                  <SmallButton
                    onClick={() => void removeIgnoredPayee(payeeKey(extractPayee(r.narration)))}
                  >
                    Stop ignoring
                  </SmallButton>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}

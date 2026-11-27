import { useState } from 'react'
import { Link } from 'wouter'
import { Button, Card, CategoryBadge, EmptyState, Money } from '../../components/ui'
import {
  applyStatementAmount,
  addStatementEntries,
  linkTransactions,
  removeIgnoredPayee,
} from '../../data/reconcile'
import { deleteTransaction } from '../../data/repo'
import { extractPayee, payeeKey, type StatementRow } from '../../domain/reconcile'
import type { Account, Category, Transaction } from '../../domain/types'
import { formatDayHeading } from '../../lib/dates'
import { defaultDraft, toEntry, type Plan } from './plan'

const signedPaise = (t: Pick<Transaction, 'type' | 'amount'>) =>
  t.type === 'expense' ? -t.amount : t.amount

function EntryLine({ t, categories }: { t: Transaction; categories: readonly Category[] }) {
  const category = categories.find((c) => c.id === t.categoryId)
  return (
    <div className="flex items-center gap-3">
      <CategoryBadge icon={category?.icon ?? '↔︎'} color={category?.color ?? '#868e96'} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px]">{t.description || t.merchant || category?.name}</div>
        <div className="truncate text-[13px] text-muted">
          PocketLog · {formatDayHeading(t.date)} · {category?.name ?? 'Transfer'}
        </div>
      </div>
      <Money
        className="shrink-0 whitespace-nowrap"
        paise={signedPaise(t)}
        signed={t.type === 'income'}
      />
    </div>
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
  if (conflicts.length === 0) {
    return <EmptyState title="No amount differences. 🎉" />
  }

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
    <div className="space-y-3">
      <p className="px-1 text-[13px] text-muted">
        The same day and a similar payee or amount, but the amounts don’t agree. Which is right?
      </p>
      {error && (
        <p role="alert" className="px-1 text-[14px] text-negative">
          {error}
        </p>
      )}
      {conflicts.map((c) => {
        const bankSigned = c.row.direction === 'out' ? -c.row.amount : c.row.amount
        return (
          <Card key={c.row.key} className="space-y-3 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0" title={c.row.narration}>
                <div className="truncate text-[15px]">Bank: {extractPayee(c.row.narration)}</div>
                <div className="text-[13px] text-muted">
                  {formatDayHeading(c.row.date)} ·{' '}
                  {accounts.find((a) => a.id === c.accountId)?.name}
                </div>
              </div>
              <Money
                className="shrink-0 whitespace-nowrap"
                paise={bankSigned}
                signed={c.row.direction === 'in'}
              />
            </div>
            <EntryLine t={c.tx} categories={categories} />
            <p className="text-[13px] font-medium text-negative">
              Bank is {c.difference > 0 ? 'higher' : 'lower'} by{' '}
              <Money paise={Math.abs(c.difference)} />
            </p>
            <div className="flex flex-wrap justify-end gap-1">
              <Button
                variant="ghost"
                className="h-9 px-3 text-[14px]"
                onClick={() => void addAsNew(c)}
              >
                Different payment
              </Button>
              <Button
                variant="secondary"
                className="h-9 px-3 text-[14px]"
                onClick={() => void linkTransactions([{ id: c.tx.id, bankRef: c.row.key }])}
              >
                Keep mine
              </Button>
              <Button
                className="h-9 px-3 text-[14px]"
                onClick={() => void applyStatementAmount(c.tx.id, c.row.amount, c.row.key)}
              >
                Use bank amount
              </Button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

export function MatchedList({
  matched,
  accountName,
  unlinked,
  onRemember,
}: {
  matched: Plan['matched']
  accountName: (id: string) => string
  unlinked: number
  onRemember: () => void
}) {
  if (matched.length === 0) return <EmptyState title="Nothing matched yet." />
  return (
    <div className="space-y-3">
      {unlinked > 0 && (
        <Card className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="text-[13px] text-muted">
            Remember these matches so later edits to an amount or date don’t break them.
          </p>
          <Button variant="secondary" className="h-9 shrink-0 text-[14px]" onClick={onRemember}>
            Remember {unlinked}
          </Button>
        </Card>
      )}
      <Card className="divide-y divide-border overflow-hidden">
        {matched.map((m) => (
          <div key={`${m.row.key}-${m.tx.id}`} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px]">
                {m.tx.description || extractPayee(m.row.narration)}
              </div>
              <div className="truncate text-[13px] text-muted">
                {formatDayHeading(m.row.date)} · {accountName(m.accountId)}
                {m.row.date !== m.tx.date && ` · logged ${formatDayHeading(m.tx.date)}`}
              </div>
            </div>
            <Money paise={m.row.direction === 'out' ? -m.row.amount : m.row.amount} />
            <span className="text-positive" aria-label="Matched">
              ✓
            </span>
          </div>
        ))}
      </Card>
    </div>
  )
}

export function ExtraList({ extra, accounts }: { extra: Transaction[]; accounts: Account[] }) {
  if (extra.length === 0) {
    return <EmptyState title="Everything in PocketLog for this period is on the statement." />
  }
  return (
    <div className="space-y-3">
      <p className="px-1 text-[13px] text-muted">
        In PocketLog for this period but not on the statement: maybe cash, another account, a wrong
        date or amount, or a duplicate.
      </p>
      {extra.map((t) => (
        <Card key={t.id} className="space-y-2 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[15px]">{t.description || t.merchant || '—'}</div>
              <div className="text-[13px] text-muted">
                {formatDayHeading(t.date)} · {accounts.find((a) => a.id === t.accountId)?.name}
              </div>
            </div>
            <Money
              className="shrink-0 whitespace-nowrap"
              paise={signedPaise(t)}
              signed={t.type === 'income'}
            />
          </div>
          <div className="flex justify-end gap-1">
            <Link
              href={`/transactions/${t.id}`}
              className="flex h-9 items-center rounded-xl px-3 text-[14px] text-accent hover:bg-surface-2"
            >
              Edit
            </Link>
            <Button
              variant="danger"
              className="h-9 px-3 text-[14px]"
              onClick={() => {
                if (window.confirm(`Delete “${t.description || t.merchant || 'this entry'}”?`)) {
                  void deleteTransaction(t.id)
                }
              }}
            >
              Delete
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
}

export function IgnoredList({ ignored }: { ignored: (StatementRow & { accountId: string })[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        className="px-1 text-[13px] text-muted underline"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Hide' : 'Show'} {ignored.length} ignored rows
      </button>
      {open && (
        <Card className="mt-2 divide-y divide-border overflow-hidden">
          {ignored.map((r) => {
            const key = payeeKey(extractPayee(r.narration))
            return (
              <div key={r.key} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1" title={r.narration}>
                  <div className="truncate text-[14px]">{extractPayee(r.narration)}</div>
                  <div className="text-[13px] text-muted">{formatDayHeading(r.date)}</div>
                </div>
                <Money paise={r.direction === 'out' ? -r.amount : r.amount} />
                <Button
                  variant="ghost"
                  className="h-8 px-2 text-[13px]"
                  onClick={() => void removeIgnoredPayee(key)}
                >
                  Stop ignoring
                </Button>
              </div>
            )
          })}
        </Card>
      )}
    </div>
  )
}

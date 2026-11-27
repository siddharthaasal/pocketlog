import { useState } from 'react'
import { Link } from 'wouter'
import { CategoryIcon } from '../../components/categoryIcons'
import { TransferIcon } from '../../components/icons'
import { EmptyState, Money } from '../../components/ui'
import {
  applyEmailAmount,
  applyStatementAmount,
  linkEmails,
  linkTransactions,
  removeIgnoredPayee,
} from '../../data/reconcile'
import { deleteTransaction } from '../../data/repo'
import { extractPayee, payeeKey, type StatementRow } from '../../domain/reconcile'
import type { Account, Category, Transaction } from '../../domain/types'
import { formatShortDate } from '../../lib/dates'
import type { Layer, Plan } from './plan'
import {
  CalendarGlyph,
  Dot,
  NumberGlyph,
  SelectGlyph,
  SmallButton,
  Table,
  Tag,
  TextGlyph,
  Td,
  Th,
  Tr,
} from '../../components/table'

const signed = (t: Pick<Transaction, 'type' | 'amount'>) =>
  t.type === 'expense' ? -t.amount : t.amount
const num = 'text-right'

function CategoryTag({ t, categories }: { t: Transaction; categories: readonly Category[] }) {
  if (t.type === 'transfer')
    return (
      <Tag>
        <TransferIcon size={13} className="inline" /> Transfer
      </Tag>
    )
  const c = categories.find((x) => x.id === t.categoryId)
  return (
    <Tag color={c?.color}>
      <CategoryIcon icon={c?.icon ?? 'tag'} size={13} className="inline" /> {c?.name ?? '—'}
    </Tag>
  )
}

const AccountTag = ({ name }: { name: string }) => (
  <Tag>
    <Dot />
    {name}
  </Tag>
)

const SOURCE = { bank: 'Bank', email: 'Email' } as const

export function ConflictsList({
  conflicts,
  categories,
  accounts,
  layer = 'bank',
}: {
  conflicts: Plan['conflicts']
  categories: Category[]
  accounts: Account[]
  layer?: Layer
}) {
  const source = SOURCE[layer]
  if (conflicts.length === 0) return <EmptyState title="No amount differences. 🎉" />
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? '?'
  return (
    <div className="space-y-2">
      <p className="px-1 text-[13px] text-muted">
        Same day and a similar payee or amount, but the amounts disagree. Pick the one that’s right.
      </p>
      <Table minWidth={900}>
        <thead>
          <tr>
            <Th className="w-[4.5rem]" icon={<CalendarGlyph />}>
              Date
            </Th>
            <Th icon={<TextGlyph />}>{source} says</Th>
            <Th className="w-[6.5rem]" icon={<NumberGlyph />}>
              {source}
            </Th>
            <Th icon={<TextGlyph />}>In PocketLog</Th>
            <Th className="w-36" icon={<SelectGlyph />}>
              Category
            </Th>
            <Th className="w-[6.5rem]" icon={<NumberGlyph />}>
              PocketLog
            </Th>
            <Th className="w-[4.5rem]" icon={<NumberGlyph />}>
              Gap
            </Th>
            <Th className="w-[16rem]" />
          </tr>
        </thead>
        <tbody>
          {conflicts.map((c) => (
            <Tr key={c.row.key}>
              <Td className="text-muted">{formatShortDate(c.row.date)}</Td>
              <Td className="max-w-0">
                <span title={`${c.row.narration} · ${accountName(c.accountId)}`}>
                  {extractPayee(c.row.narration)}
                </span>
              </Td>
              <Td className={num}>
                <Money paise={c.row.direction === 'out' ? -c.row.amount : c.row.amount} />
              </Td>
              <Td className="max-w-0">{c.tx.description || c.tx.merchant}</Td>
              <Td>
                <CategoryTag t={c.tx} categories={categories} />
              </Td>
              <Td className={num}>
                <Money paise={signed(c.tx)} />
              </Td>
              <Td className={`${num} font-medium text-negative`}>
                {c.difference > 0 ? '+' : '−'}
                <Money paise={Math.abs(c.difference)} />
              </Td>
              <Td className="overflow-visible px-1! text-right">
                <SmallButton
                  className="px-1!"
                  title="Your amount is right: remember this match and stop flagging it"
                  onClick={() =>
                    void (layer === 'email'
                      ? linkEmails([{ id: c.tx.id, emailRef: c.row.key }])
                      : linkTransactions([{ id: c.tx.id, bankRef: c.row.key }]))
                  }
                >
                  Keep PocketLog
                </SmallButton>
                <SmallButton
                  tone="primary"
                  className="px-1!"
                  title={`Change your entry to the amount on the ${layer === 'email' ? 'email' : 'bank statement'}`}
                  onClick={() =>
                    void (layer === 'email'
                      ? applyEmailAmount(c.tx.id, c.row.amount, c.row.key)
                      : applyStatementAmount(c.tx.id, c.row.amount, c.row.key))
                  }
                >
                  {layer === 'email' ? 'Use from email' : 'Use from bank statement'}
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
            <Th className="w-24" icon={<CalendarGlyph />}>
              Date
            </Th>
            <Th icon={<TextGlyph />}>Name</Th>
            <Th className="w-32" icon={<NumberGlyph />}>
              Amount
            </Th>
            <Th className="w-56" icon={<SelectGlyph />}>
              Category
            </Th>
            <Th className="w-32" icon={<SelectGlyph />}>
              Account
            </Th>
            <Th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {matched.map((m) => (
            <Tr key={`${m.row.key}-${m.tx.id}`}>
              <Td className="text-muted">{formatShortDate(m.row.date)}</Td>
              <Td className="max-w-0">
                <span
                  title={
                    m.row.date !== m.tx.date
                      ? `Bank: ${formatShortDate(m.row.date)} · logged on ${formatShortDate(m.tx.date)}`
                      : m.row.narration
                  }
                >
                  {m.tx.description || extractPayee(m.row.narration)}
                </span>
              </Td>
              <Td className={num}>
                <Money paise={m.row.direction === 'out' ? -m.row.amount : m.row.amount} />
              </Td>
              <Td>
                <CategoryTag t={m.tx} categories={categories} />
              </Td>
              <Td>
                <AccountTag name={accountName(m.accountId)} />
              </Td>
              <Td className="text-center text-positive" aria-label="Matched">
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
  layer = 'bank',
}: {
  extra: Transaction[]
  categories: Category[]
  accounts: Account[]
  layer?: Layer
}) {
  if (extra.length === 0) {
    return (
      <EmptyState
        title={
          layer === 'email'
            ? 'Every entry from a merchant that emails you has its email.'
            : 'Everything in PocketLog for this period is on the statement.'
        }
      />
    )
  }
  return (
    <div className="space-y-2">
      <p className="px-1 text-[13px] text-muted">
        {layer === 'email'
          ? 'From a merchant that emails you, but no email was found: maybe it wasn’t swept yet, or the date or amount is wrong, or it’s a duplicate.'
          : 'In PocketLog for this period but not on the statement: maybe cash, another account, a wrong date or amount, or a duplicate.'}
      </p>
      <Table minWidth={720}>
        <thead>
          <tr>
            <Th className="w-24" icon={<CalendarGlyph />}>
              Date
            </Th>
            <Th icon={<TextGlyph />}>Name</Th>
            <Th className="w-32" icon={<NumberGlyph />}>
              Amount
            </Th>
            <Th className="w-56" icon={<SelectGlyph />}>
              Category
            </Th>
            <Th className="w-32" icon={<SelectGlyph />}>
              Account
            </Th>
            <Th className="w-32" />
          </tr>
        </thead>
        <tbody>
          {extra.map((t) => (
            <Tr key={t.id}>
              <Td className="text-muted">{formatShortDate(t.date)}</Td>
              <Td className="max-w-0">{t.description || t.merchant || '—'}</Td>
              <Td className={num}>
                <Money paise={signed(t)} />
              </Td>
              <Td>
                <CategoryTag t={t} categories={categories} />
              </Td>
              <Td>
                <AccountTag name={accounts.find((a) => a.id === t.accountId)?.name ?? '?'} />
              </Td>
              <Td className="text-right">
                <Link
                  href={`/transactions/${t.id}`}
                  className="inline-flex h-7 items-center rounded-md px-2 text-[13.5px] text-muted hover:bg-surface-2 hover:text-text"
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
              <Th className="w-24" icon={<CalendarGlyph />}>
                Date
              </Th>
              <Th icon={<TextGlyph />}>Name</Th>
              <Th className="w-32" icon={<NumberGlyph />}>
                Amount
              </Th>
              <Th className="w-36" />
            </tr>
          </thead>
          <tbody>
            {ignored.map((r) => (
              <Tr key={r.key}>
                <Td className="text-muted">{formatShortDate(r.date)}</Td>
                <Td className="max-w-0">
                  <span title={r.narration}>{extractPayee(r.narration)}</span>
                </Td>
                <Td className={num}>
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

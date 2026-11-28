import { useLocation } from 'wouter'
import { CategoryIcon } from '../../components/categoryIcons'
import { TransferIcon } from '../../components/icons'
import { Money } from '../../components/ui'
import {
  CalendarGlyph,
  Dot,
  NumberGlyph,
  SelectGlyph,
  Table,
  Tag,
  TextGlyph,
  Td,
  Th,
  Tr,
} from '../../components/table'
import type { Lookups } from '../../data/hooks'
import { formatINR } from '../../domain/money'
import type { Transaction } from '../../domain/types'
import { formatShortDate } from '../../lib/dates'

/** The Notion-style database view of transactions, for screens wide enough to hold it. */
export function TransactionsTable({
  transactions,
  lookups,
  selected,
  onSelect,
}: {
  transactions: Transaction[]
  lookups: Lookups
  /** Ticked rows, for changing several at once. */
  selected: ReadonlySet<string>
  onSelect: (ids: readonly string[], on: boolean) => void
}) {
  const [, navigate] = useLocation()
  const all = transactions.length > 0 && transactions.every((t) => selected.has(t.id))
  const some = !all && transactions.some((t) => selected.has(t.id))
  return (
    <Table minWidth={680}>
      <thead>
        <tr>
          <Th className="w-9">
            <input
              type="checkbox"
              className="h-4 w-4 accent-accent"
              aria-label="Select all"
              checked={all}
              ref={(el) => {
                if (el) el.indeterminate = some
              }}
              onChange={(e) =>
                onSelect(
                  transactions.map((t) => t.id),
                  e.target.checked,
                )
              }
            />
          </Th>
          <Th className="w-24" icon={<CalendarGlyph />}>
            Date
          </Th>
          <Th icon={<TextGlyph />}>Name</Th>
          <Th className="w-32" icon={<NumberGlyph />}>
            Amount
          </Th>
          <Th className="w-52" icon={<SelectGlyph />}>
            Category
          </Th>
          <Th className="w-40" icon={<SelectGlyph />}>
            Account
          </Th>
        </tr>
      </thead>
      <tbody>
        {transactions.map((t) => {
          const category = t.categoryId ? lookups.categories.get(t.categoryId) : undefined
          const account = lookups.accounts.get(t.accountId)?.name ?? '?'
          const toAccount = t.toAccountId ? lookups.accounts.get(t.toAccountId)?.name : undefined
          const name = t.description || t.merchant || category?.name || 'Transfer'
          const split = t.splits && t.splits.length > 1 ? t.splits : null
          return (
            <Tr
              key={t.id}
              selected={selected.has(t.id)}
              onClick={() => navigate(`/transactions/${t.id}`)}
            >
              <Td onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-accent"
                  aria-label={`Select ${name}`}
                  checked={selected.has(t.id)}
                  onChange={(e) => onSelect([t.id], e.target.checked)}
                />
              </Td>
              <Td className="text-muted">{formatShortDate(t.date)}</Td>
              <Td className="max-w-0">
                <span className="flex max-w-full items-center gap-2">
                  {t.needsReview && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
                      title="Needs review"
                    />
                  )}
                  <span className="truncate" title={t.notes || t.merchant}>
                    {name}
                  </span>
                  {t.tags?.map((tag) => (
                    <span key={tag} className="shrink-0 text-[12.5px] text-muted">
                      #{tag}
                    </span>
                  ))}
                </span>
              </Td>
              <Td className="text-right">
                <Money
                  paise={t.type === 'expense' ? -t.amount : t.amount}
                  signed={t.type === 'income'}
                  className={t.type === 'transfer' ? 'text-muted' : undefined}
                />
              </Td>
              <Td>
                {t.type === 'transfer' ? (
                  <Tag>
                    <TransferIcon size={13} className="inline" /> Transfer
                  </Tag>
                ) : (
                  <span className="flex items-center gap-1">
                    <Tag color={category?.color}>
                      <CategoryIcon icon={category?.icon ?? 'tag'} size={13} className="inline" />{' '}
                      {category?.name ?? '-'}
                    </Tag>
                    {split && (
                      <Tag
                        title={split
                          .map(
                            (p) =>
                              `${lookups.categories.get(p.categoryId)?.name ?? '?'} ${formatINR(p.amount)}`,
                          )
                          .join(' + ')}
                      >
                        +{split.length - 1}
                      </Tag>
                    )}
                  </span>
                )}
              </Td>
              <Td>
                <Tag>
                  <Dot />
                  {t.type === 'transfer' ? `${account} → ${toAccount ?? '?'}` : account}
                </Tag>
              </Td>
            </Tr>
          )
        })}
      </tbody>
    </Table>
  )
}

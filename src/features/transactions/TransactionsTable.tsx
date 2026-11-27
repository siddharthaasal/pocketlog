import { useLocation } from 'wouter'
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
import type { Transaction } from '../../domain/types'
import { formatShortDate } from '../../lib/dates'

/** The Notion-style database view of transactions, for screens wide enough to hold it. */
export function TransactionsTable({
  transactions,
  lookups,
}: {
  transactions: Transaction[]
  lookups: Lookups
}) {
  const [, navigate] = useLocation()
  return (
    <Table minWidth={640}>
      <thead>
        <tr>
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
          return (
            <Tr key={t.id} onClick={() => navigate(`/transactions/${t.id}`)}>
              <Td className="text-muted">{formatShortDate(t.date)}</Td>
              <Td className="max-w-0">
                <span className="inline-flex max-w-full items-center gap-2">
                  {t.needsReview && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
                      title="Needs review"
                    />
                  )}
                  <span className="truncate" title={t.notes || t.merchant}>
                    {name}
                  </span>
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
                  <Tag>⇄ Transfer</Tag>
                ) : (
                  <Tag color={category?.color}>
                    {category?.icon} {category?.name ?? '—'}
                  </Tag>
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

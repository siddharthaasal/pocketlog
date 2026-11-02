import { Link } from 'wouter'
import { CategoryBadge, Money } from '../../components/ui'
import type { Lookups } from '../../data/hooks'
import type { Transaction } from '../../domain/types'

export function TransactionRow({ t, lookups }: { t: Transaction; lookups: Lookups }) {
  const category = t.categoryId ? lookups.categories.get(t.categoryId) : undefined
  const account = lookups.accounts.get(t.accountId)
  const toAccount = t.toAccountId ? lookups.accounts.get(t.toAccountId) : undefined

  const title =
    t.description || t.merchant || category?.name || (t.type === 'transfer' ? 'Transfer' : '—')
  const subtitle =
    t.type === 'transfer'
      ? `${account?.name ?? '?'} → ${toAccount?.name ?? '?'}`
      : [category?.name, account?.name].filter(Boolean).join(' · ')

  return (
    <Link
      href={`/transactions/${t.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60"
    >
      <CategoryBadge icon={category?.icon ?? '↔︎'} color={category?.color ?? '#868e96'} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px]">{title}</div>
        <div className="truncate text-[13px] text-muted">
          {t.needsReview && <span className="mr-1.5 font-medium text-accent">Review</span>}
          {subtitle}
        </div>
      </div>
      <Money
        paise={t.type === 'expense' ? -t.amount : t.amount}
        signed={t.type === 'income'}
        className={t.type === 'transfer' ? 'text-muted' : undefined}
      />
    </Link>
  )
}

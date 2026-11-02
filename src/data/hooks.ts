import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import type { Account, Category, Transaction } from '../domain/types'
import { monthBounds } from '../lib/dates'
import { db } from './db'

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

/** Newest first: by date, then by time of entry. */
const byNewest = (a: Transaction, b: Transaction) =>
  b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)

export function useCategories(): Category[] | undefined {
  return useLiveQuery(async () =>
    (await db.categories.toArray()).filter((c) => !c.deletedAt).sort(byName),
  )
}

export function useAccounts(): Account[] | undefined {
  return useLiveQuery(async () =>
    (await db.accounts.toArray()).filter((a) => !a.deletedAt).sort(byName),
  )
}

export function useTransactionsInMonth(month: string): Transaction[] | undefined {
  return useLiveQuery(async () => {
    const [start, end] = monthBounds(month)
    const rows = await db.transactions.where('date').between(start, end, true, true).toArray()
    return rows.filter((t) => !t.deletedAt).sort(byNewest)
  }, [month])
}

export function useAllTransactions(): Transaction[] | undefined {
  return useLiveQuery(async () =>
    (await db.transactions.toArray()).filter((t) => !t.deletedAt).sort(byNewest),
  )
}

/** `null` once loaded and not found; `undefined` while loading. */
export function useTransaction(id: string | undefined): Transaction | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null
    const t = await db.transactions.get(id)
    return t && !t.deletedAt ? t : null
  }, [id])
}

export interface Lookups {
  categories: Map<string, Category>
  accounts: Map<string, Account>
}

export function useLookups(): Lookups | undefined {
  const categories = useCategories()
  const accounts = useAccounts()
  return useMemo(() => {
    if (!categories || !accounts) return undefined
    return {
      categories: new Map(categories.map((c) => [c.id, c])),
      accounts: new Map(accounts.map((a) => [a.id, a])),
    }
  }, [categories, accounts])
}

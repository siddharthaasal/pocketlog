import Dexie, { type EntityTable } from 'dexie'
import type { Account, Category, InboxEntry, MetaEntry, Transaction } from '../domain/types'
import { seedDatabase } from './seed'

export type PocketLogDB = Dexie & {
  transactions: EntityTable<Transaction, 'id'>
  categories: EntityTable<Category, 'id'>
  accounts: EntityTable<Account, 'id'>
  inbox: EntityTable<InboxEntry, 'key'>
  meta: EntityTable<MetaEntry, 'key'>
}

/**
 * Schema history. Never edit a released version; add a new `db.version(n)` with an
 * `.upgrade()` callback instead, so existing data on the phone migrates in place.
 */
export function createDatabase(name = 'pocketlog'): PocketLogDB {
  const db = new Dexie(name) as PocketLogDB

  db.version(1).stores({
    transactions: 'id, date, [date+createdAt], type, categoryId, accountId, toAccountId, updatedAt',
    categories: 'id, type, updatedAt',
    accounts: 'id, updatedAt',
    inbox: 'key, recordedAt',
    meta: 'key',
  })

  db.on('populate', (tx) => seedDatabase(tx))

  return db
}

export const db = createDatabase()

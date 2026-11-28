import Dexie, { type EntityTable } from 'dexie'
import { classGroupId, groupsFromClassTargets, LEGACY_TARGETS_KEY } from '../domain/investments'
import type {
  Account,
  AccountBalance,
  AllocationGroup,
  Category,
  Holding,
  InboxEntry,
  Loan,
  LoanBalance,
  MetaEntry,
  NetWorthSnapshot,
  Policy,
  Subscription,
  Transaction,
  Valuation,
} from '../domain/types'
import { nowISO } from '../lib/ids'
import { seedDatabase } from './seed'

export type PocketLogDB = Dexie & {
  transactions: EntityTable<Transaction, 'id'>
  categories: EntityTable<Category, 'id'>
  accounts: EntityTable<Account, 'id'>
  inbox: EntityTable<InboxEntry, 'key'>
  meta: EntityTable<MetaEntry, 'key'>
  holdings: EntityTable<Holding, 'id'>
  valuations: EntityTable<Valuation, 'id'>
  loans: EntityTable<Loan, 'id'>
  loanBalances: EntityTable<LoanBalance, 'id'>
  subscriptions: EntityTable<Subscription, 'id'>
  policies: EntityTable<Policy, 'id'>
  accountBalances: EntityTable<AccountBalance, 'id'>
  snapshots: EntityTable<NetWorthSnapshot, 'id'>
  allocationGroups: EntityTable<AllocationGroup, 'id'>
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

  // Finance tracker: holdings, loans, subscriptions, policies, balance checkpoints, snapshots.
  // Existing rows are untouched; the new transaction fields are optional.
  db.version(2).stores({
    transactions:
      'id, date, [date+createdAt], type, categoryId, accountId, toAccountId, updatedAt, loanId, subscriptionId, holdingId, refundOf',
    holdings: 'id, kind, updatedAt',
    valuations: 'id, holdingId, month, [holdingId+month]',
    loans: 'id, updatedAt',
    loanBalances: 'id, loanId, month, [loanId+month]',
    subscriptions: 'id, status, updatedAt',
    policies: 'id, updatedAt',
    accountBalances: 'id, accountId, [accountId+date]',
    snapshots: 'id, month',
  })

  // Allocation groups replace the per-class targets kept in meta. Each class that had a target
  // or a holding becomes a group, and its holdings join it.
  db.version(3)
    .stores({ allocationGroups: 'id, updatedAt' })
    .upgrade(async (tx) => {
      const saved = (await tx.table('meta').get(LEGACY_TARGETS_KEY)) as
        { value: Parameters<typeof groupsFromClassTargets>[0] } | undefined
      const holdings = (await tx.table('holdings').toArray()) as Holding[]
      const groups = groupsFromClassTargets(saved?.value, holdings, nowISO())
      await tx.table('allocationGroups').bulkPut(groups)
      const made = new Set(groups.map((g) => g.id))
      await tx
        .table('holdings')
        .toCollection()
        .modify((h: Holding) => {
          const id = classGroupId(h.assetClass)
          if (made.has(id)) h.groupId = id
        })
      await tx.table('meta').delete(LEGACY_TARGETS_KEY)
    })

  db.on('populate', (tx) => seedDatabase(tx))

  return db
}

export const db = createDatabase()

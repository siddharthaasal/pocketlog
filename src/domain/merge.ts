import type { BackupData, InvalidRow } from './backup'
import type { InboxEntry } from './types'

interface Versioned {
  id: string
  updatedAt: string
  deletedAt?: string | undefined
}

export interface MergeCounts {
  added: number
  updated: number
  deleted: number
  unchanged: number
  /** This device had a newer version, so the file's copy was ignored. */
  keptLocal: number
}

const emptyCounts = (): MergeCounts => ({
  added: 0,
  updated: 0,
  deleted: 0,
  unchanged: 0,
  keptLocal: 0,
})

/**
 * Last-writer-wins per record, by `updatedAt`. Deletions are records too (tombstones),
 * so they travel between devices. Merging the same file twice changes nothing.
 */
export function mergeTable<T extends Versioned>(
  local: readonly T[],
  incoming: readonly T[],
): { writes: T[]; counts: MergeCounts } {
  const byId = new Map(local.map((r) => [r.id, r]))
  const writes: T[] = []
  const counts = emptyCounts()

  for (const theirs of incoming) {
    const ours = byId.get(theirs.id)
    if (!ours) {
      writes.push(theirs)
      if (theirs.deletedAt) counts.deleted++
      else counts.added++
    } else if (theirs.updatedAt > ours.updatedAt) {
      writes.push(theirs)
      if (theirs.deletedAt && !ours.deletedAt) counts.deleted++
      else counts.updated++
    } else if (theirs.updatedAt === ours.updatedAt) {
      counts.unchanged++
    } else {
      counts.keptLocal++
    }
  }
  return { writes, counts }
}

/** Inbox entries have no versions: keep both sides, preferring one that became a transaction. */
function mergeInbox(local: readonly InboxEntry[], incoming: readonly InboxEntry[]): InboxEntry[] {
  const byKey = new Map(local.map((e) => [e.key, e]))
  return incoming.filter((theirs) => {
    const ours = byKey.get(theirs.key)
    return !ours || (ours.status !== 'imported' && theirs.status === 'imported')
  })
}

export interface MergePlan {
  writes: BackupData
  counts: Record<'transactions' | 'categories' | 'accounts', MergeCounts>
  /** Rows that can't be merged because something they point to is missing. */
  invalid: InvalidRow[]
}

export function planMerge(local: BackupData, incoming: BackupData): MergePlan {
  const accountIds = new Set([...local.accounts, ...incoming.accounts].map((a) => a.id))
  const categoryIds = new Set([...local.categories, ...incoming.categories].map((c) => c.id))

  const invalid: InvalidRow[] = []
  const transactions = incoming.transactions.filter((t) => {
    const missing =
      !accountIds.has(t.accountId) ||
      (t.toAccountId !== undefined && !accountIds.has(t.toAccountId)) ||
      (t.categoryId !== undefined && !categoryIds.has(t.categoryId))
    if (missing && !t.deletedAt) {
      invalid.push({
        table: 'transactions',
        id: t.id,
        reason: 'Refers to an account or category that isn’t in the file',
      })
      return false
    }
    return true
  })

  const tx = mergeTable(local.transactions, transactions)
  const categories = mergeTable(local.categories, incoming.categories)
  const accounts = mergeTable(local.accounts, incoming.accounts)

  return {
    writes: {
      transactions: tx.writes,
      categories: categories.writes,
      accounts: accounts.writes,
      inbox: mergeInbox(local.inbox, incoming.inbox),
    },
    counts: { transactions: tx.counts, categories: categories.counts, accounts: accounts.counts },
    invalid,
  }
}

export function hasChanges(plan: MergePlan): boolean {
  return Object.values(plan.writes).some((rows) => rows.length > 0)
}

import { extraDefaults } from '../domain/accounts'
import { createBackup, serializeBackup, type BackupData } from '../domain/backup'
import { transactionsToCsv } from '../domain/csv'
import { planMerge, type MergePlan } from '../domain/merge'
import { nowISO } from '../lib/ids'
import { db } from './db'

export const LAST_BACKUP_KEY = 'lastBackupAt'

/** Everything, including deleted rows, so deletions reach the other device. */
export async function collectData(): Promise<BackupData> {
  const [transactions, categories, accounts, inbox] = await Promise.all([
    db.transactions.toArray(),
    db.categories.toArray(),
    db.accounts.toArray(),
    db.inbox.toArray(),
  ])
  return { transactions, categories, accounts, inbox }
}

export async function exportBackupText(passphrase?: string): Promise<string> {
  return serializeBackup(createBackup(await collectData(), nowISO()), passphrase)
}

export async function exportCsvText(): Promise<string> {
  const { transactions, categories, accounts } = await collectData()
  return transactionsToCsv(
    transactions,
    new Map(categories.map((c) => [c.id, c])),
    new Map(accounts.map((a) => [a.id, a])),
  )
}

/** Called once the backup file has actually been saved or shared. */
export async function recordBackup(at = nowISO()): Promise<void> {
  await db.meta.put({ key: LAST_BACKUP_KEY, value: at })
}

const ALL_TABLES = () => [db.transactions, db.categories, db.accounts, db.inbox]

async function clearExtraDefaults(): Promise<void> {
  const now = nowISO()
  for (const account of extraDefaults(await db.accounts.toArray())) {
    await db.accounts.update(account.id, { isDefault: false, updatedAt: now })
  }
}

/** What a merge would do, for the preview. */
export async function previewMerge(incoming: BackupData): Promise<MergePlan> {
  return planMerge(await collectData(), incoming)
}

/**
 * Merges a backup or another device's export into this device. The plan is recomputed
 * inside the write transaction, so edits made while the preview was open aren't lost.
 */
export async function applyMerge(incoming: BackupData): Promise<MergePlan> {
  return db.transaction('rw', ALL_TABLES(), async () => {
    const plan = planMerge(await collectData(), incoming)
    await db.transactions.bulkPut(plan.writes.transactions)
    await db.categories.bulkPut(plan.writes.categories)
    await db.accounts.bulkPut(plan.writes.accounts)
    await db.inbox.bulkPut(plan.writes.inbox)
    await clearExtraDefaults()
    return plan
  })
}

/** Restores a backup exactly, discarding everything on this device first. */
export async function replaceAll(incoming: BackupData): Promise<void> {
  if (!incoming.accounts.some((a) => !a.deletedAt)) {
    throw new Error('This backup has no accounts, so it can’t replace your data.')
  }
  await db.transaction('rw', ALL_TABLES(), async () => {
    await Promise.all(ALL_TABLES().map((table) => table.clear()))
    await db.transactions.bulkPut(incoming.transactions)
    await db.categories.bulkPut(incoming.categories)
    await db.accounts.bulkPut(incoming.accounts)
    await db.inbox.bulkPut(incoming.inbox)
    await clearExtraDefaults()
  })
}

/** Erases the database on this device; the default categories and accounts are recreated. */
export async function deleteAllData(): Promise<void> {
  await db.delete()
  await db.open()
}

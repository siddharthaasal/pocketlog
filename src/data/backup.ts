import { extraDefaults } from '../domain/accounts'
import { createBackup, serializeBackup, type BackupData, type BackupFile } from '../domain/backup'
import { transactionsToCsv } from '../domain/csv'
import { planMerge, type MergePlan } from '../domain/merge'
import { deviceName } from '../lib/device'
import { nowISO } from '../lib/ids'
import { db } from './db'

export const LAST_BACKUP_KEY = 'lastBackupAt'
export const LAST_SYNC_KEY = 'lastSyncAt'

/** The last time a file from another device (or a backup) was merged in. */
export interface LastSync {
  /** When it was merged here. */
  at: string
  /** When the file was made, and on what kind of device, when the file says. */
  exportedAt?: string
  from?: string
}

/** Everything, including deleted rows, so deletions reach the other device. */
export async function collectData(): Promise<BackupData> {
  const [
    transactions,
    categories,
    accounts,
    inbox,
    holdings,
    valuations,
    loans,
    loanBalances,
    subscriptions,
    policies,
    accountBalances,
    snapshots,
    allocationGroups,
  ] = await Promise.all(TABLES().map((table) => table.toArray()))
  return {
    transactions,
    categories,
    accounts,
    inbox,
    holdings,
    valuations,
    loans,
    loanBalances,
    subscriptions,
    policies,
    accountBalances,
    snapshots,
    allocationGroups,
  } as BackupData
}

export async function exportBackupText(passphrase?: string): Promise<string> {
  return serializeBackup(createBackup(await collectData(), nowISO(), deviceName()), passphrase)
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

/** In the same order as the fields of `BackupData`. */
const TABLES = () =>
  [
    db.transactions,
    db.categories,
    db.accounts,
    db.inbox,
    db.holdings,
    db.valuations,
    db.loans,
    db.loanBalances,
    db.subscriptions,
    db.policies,
    db.accountBalances,
    db.snapshots,
    db.allocationGroups,
  ] as const

const ALL_TABLES = TABLES

async function writeAll(data: BackupData): Promise<void> {
  const rows = TABLES()
  const values = [
    data.transactions,
    data.categories,
    data.accounts,
    data.inbox,
    data.holdings,
    data.valuations,
    data.loans,
    data.loanBalances,
    data.subscriptions,
    data.policies,
    data.accountBalances,
    data.snapshots,
    data.allocationGroups,
  ]
  for (const [i, table] of rows.entries()) {
    await (table as { bulkPut(rows: unknown[]): Promise<unknown> }).bulkPut(values[i] ?? [])
  }
}

async function clearExtraDefaults(): Promise<void> {
  const now = nowISO()
  for (const account of extraDefaults(await db.accounts.toArray())) {
    await db.accounts.update(account.id, { isDefault: false, updatedAt: now })
  }
}

export async function recordSync(file: Pick<BackupFile, 'exportedAt' | 'device'>): Promise<void> {
  const value: LastSync = {
    at: nowISO(),
    ...(file.exportedAt && { exportedAt: file.exportedAt }),
    ...(file.device && { from: file.device }),
  }
  await db.meta.put({ key: LAST_SYNC_KEY, value })
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
    await writeAll(plan.writes)
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
    await writeAll(incoming)
    await clearExtraDefaults()
  })
}

/** Erases the database on this device; the default categories and accounts are recreated. */
export async function deleteAllData(): Promise<void> {
  await db.delete()
  await db.open()
}

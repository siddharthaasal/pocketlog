import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { readBackupText } from '../domain/backup'
import { applyMerge, collectData, deleteAllData, exportBackupText, replaceAll } from './backup'
import { createDatabase, db } from './db'
import { addTransaction, deleteTransaction, updateAccount, updateTransaction } from './repo'

const lunch = {
  type: 'expense' as const,
  amount: 35000,
  description: 'Lunch',
  categoryId: 'cat-food',
  accountId: 'acc-hdfc',
  date: '2026-11-02',
}

async function exported() {
  const result = await readBackupText(await exportBackupText())
  if (result.status !== 'ok') throw new Error(result.status)
  return result.backup.data
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('export and merge', () => {
  it('restores everything after the data is lost', async () => {
    await addTransaction(lunch)
    const backup = await exported()
    await deleteAllData()
    expect(await db.transactions.count()).toBe(0)

    const plan = await applyMerge(backup)
    expect(plan.counts.transactions.added).toBe(1)
    expect(await db.transactions.count()).toBe(1)
  })

  it('restores edited accounts after storage is wiped and the defaults are recreated', async () => {
    await updateAccount('acc-hdfc', { name: 'HDFC Salary', openingBalance: 5_000_000 })
    const backup = await exported()
    await deleteAllData()
    expect((await db.accounts.get('acc-hdfc'))?.name).toBe('HDFC Bank')

    const plan = await applyMerge(backup)
    expect(plan.counts.accounts.updated).toBe(1)
    expect(await db.accounts.get('acc-hdfc')).toMatchObject({
      name: 'HDFC Salary',
      openingBalance: 5_000_000,
    })
  })

  it('two fresh devices have identical defaults', async () => {
    const first = await exported()
    await deleteAllData()
    const second = await exported()
    expect(second.categories).toEqual(first.categories)
    expect(second.accounts).toEqual(first.accounts)
  })

  it('merging the same file twice changes nothing', async () => {
    await addTransaction(lunch)
    const backup = await exported()
    await applyMerge(backup)
    const again = await applyMerge(backup)
    expect(again.writes.transactions).toEqual([])
    expect(await db.transactions.count()).toBe(1)
  })

  it('two devices converge after syncing in both directions', async () => {
    // Shared starting point.
    const shared = await addTransaction(lunch)
    const start = await exported()

    // "Phone" = the default db; "Mac" = a second database that starts from the same data.
    const mac = createDatabase('pocketlog-mac')
    await mac.open()
    await mac.transactions.bulkPut(start.transactions)

    // Phone edits the shared entry and adds one; Mac deletes nothing but adds its own.
    await updateTransaction(shared.id, { ...lunch, amount: 40000 })
    await addTransaction({ ...lunch, description: 'Coffee', amount: 15000 })
    const macOnly = { ...start.transactions[0]!, id: 'mac-1', description: 'Mac entry' }
    await mac.transactions.put(macOnly)

    // Mac → phone
    const macData = { ...start, transactions: await mac.transactions.toArray() }
    await applyMerge(macData)
    // Phone → Mac (apply the phone's export to the Mac's rows using the same rules)
    const phoneData = await exported()
    const { planMerge } = await import('../domain/merge')
    const plan = planMerge({ ...start, transactions: await mac.transactions.toArray() }, phoneData)
    await mac.transactions.bulkPut(plan.writes.transactions)

    const phoneRows = (await db.transactions.toArray())
      .map((t) => [t.id, t.amount, t.description])
      .sort()
    const macRows = (await mac.transactions.toArray())
      .map((t) => [t.id, t.amount, t.description])
      .sort()
    expect(macRows).toEqual(phoneRows)
    expect(phoneRows).toHaveLength(3)
    expect(phoneRows.find((r) => r[0] === shared.id)?.[1]).toBe(40000)
    await mac.delete()
  })

  it('a deletion on one device removes the entry on the other', async () => {
    const t = await addTransaction(lunch)
    const before = await exported()
    await deleteTransaction(t.id)
    const after = await exported()

    await replaceAll(before)
    expect((await db.transactions.get(t.id))?.deletedAt).toBeUndefined()
    const plan = await applyMerge(after)
    expect(plan.counts.transactions.deleted).toBe(1)
    expect((await db.transactions.get(t.id))?.deletedAt).toBeDefined()
  })

  it('leaves a single default account after merging two defaults', async () => {
    const other = await exported()
    other.accounts = other.accounts.map((a) =>
      a.id === 'acc-cash' ? { ...a, isDefault: true, updatedAt: '2099-01-01T00:00:00.000Z' } : a,
    )
    await updateAccount('acc-hdfc', { isDefault: true })
    await applyMerge(other)
    const defaults = (await db.accounts.toArray()).filter((a) => a.isDefault).map((a) => a.id)
    expect(defaults).toEqual(['acc-cash'])
  })
})

describe('replace and delete', () => {
  it('replaceAll restores the backup exactly', async () => {
    await addTransaction(lunch)
    const backup = await exported()
    await addTransaction({ ...lunch, description: 'Extra' })
    await replaceAll(backup)
    expect(await collectData()).toEqual(backup)
  })

  it('refuses a backup without accounts', async () => {
    const backup = await exported()
    await expect(replaceAll({ ...backup, accounts: [] })).rejects.toThrow(/no accounts/)
  })

  it('deleteAllData wipes transactions and recreates the defaults', async () => {
    await addTransaction(lunch)
    await deleteAllData()
    expect(await db.transactions.count()).toBe(0)
    expect(await db.accounts.get('acc-hdfc')).toBeDefined()
  })
})

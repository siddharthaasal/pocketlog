import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { readBackupText } from '../domain/backup'
import { reconcile } from '../domain/reconcile'
import { exportBackupText } from './backup'
import { db } from './db'
import {
  addIgnoredPayee,
  addStatementEntries,
  applyStatementAmount,
  linkTransactions,
  removeIgnoredPayee,
} from './reconcile'
import { addTransaction, updateTransaction } from './repo'

const input = {
  type: 'expense' as const,
  amount: 56_000,
  description: 'Instamart',
  categoryId: 'cat-groceries',
  accountId: 'acc-hdfc',
  date: '2026-11-01',
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('statement entries', () => {
  it('stores the bank reference and survives edits and backups', async () => {
    await addStatementEntries([{ input, bankRef: 'stmt-abc', needsReview: false }])
    const [t] = await db.transactions.toArray()
    expect(t).toMatchObject({ source: 'import', bankRef: 'stmt-abc', needsReview: false })

    await updateTransaction(t!.id, { ...input, description: 'Instamart order' })
    expect((await db.transactions.get(t!.id))!.bankRef).toBe('stmt-abc')

    const restored = await readBackupText(await exportBackupText())
    expect(restored.status === 'ok' && restored.backup.data.transactions[0]!.bankRef).toBe(
      'stmt-abc',
    )
    expect(restored.status === 'ok' && restored.invalid).toEqual([])
  })

  it('adds all entries or none', async () => {
    await expect(
      addStatementEntries([
        { input, bankRef: 'a', needsReview: false },
        { input: { ...input, categoryId: 'nope' }, bankRef: 'b', needsReview: false },
      ]),
    ).rejects.toThrow()
    expect(await db.transactions.count()).toBe(0)
  })

  it('makes a second reconcile of the same statement find everything matched', async () => {
    const row = {
      key: 'stmt-abc',
      date: '2026-11-01',
      amount: 56_000,
      direction: 'out' as const,
      narration: 'UPI-SWIGGY INSTAMART-x-1-UPI',
    }
    await addStatementEntries([{ input, bankRef: row.key, needsReview: false }])
    const res = reconcile([row], await db.transactions.toArray(), 'acc-hdfc')
    expect(res.matched).toHaveLength(1)
    expect(res.missing).toHaveLength(0)
  })
})

describe('fixing and linking', () => {
  it('corrects an amount to the bank’s and links the entry', async () => {
    const t = await addTransaction({ ...input, amount: 81_200 }, { needsReview: true })
    await applyStatementAmount(t.id, 81_238, 'stmt-x')
    expect(await db.transactions.get(t.id)).toMatchObject({
      amount: 81_238,
      bankRef: 'stmt-x',
      needsReview: false,
    })
  })

  it('links an existing entry without changing it', async () => {
    const t = await addTransaction(input)
    await linkTransactions([{ id: t.id, bankRef: 'stmt-y' }])
    expect(await db.transactions.get(t.id)).toMatchObject({ amount: 56_000, bankRef: 'stmt-y' })
  })
})

describe('ignored payees', () => {
  it('adds each payee once and can remove it', async () => {
    await addIgnoredPayee('vendolite india')
    await addIgnoredPayee('vendolite india')
    await addIgnoredPayee('shalini yadav')
    expect((await db.meta.get('reconcile.ignore'))!.value).toEqual([
      'vendolite india',
      'shalini yadav',
    ])
    await removeIgnoredPayee('vendolite india')
    expect((await db.meta.get('reconcile.ignore'))!.value).toEqual(['shalini yadav'])
  })
})

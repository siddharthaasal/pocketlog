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

describe('email entries', () => {
  it('keeps the email link beside a bank link, and survives edits and backups', async () => {
    const { addStatementEntries, linkEmails, linkTransactions } = await import('./reconcile')
    await addStatementEntries([
      {
        input: {
          type: 'expense',
          amount: 45_000,
          description: 'Swiggy',
          categoryId: 'cat-food',
          accountId: 'acc-hdfc',
          date: '2026-11-10',
        },
        emailRef: 'email-abc',
        needsReview: true,
      },
    ])
    const [t] = await db.transactions.toArray()
    expect(t).toMatchObject({ emailRef: 'email-abc', source: 'import' })
    expect(t!.bankRef).toBeUndefined()

    // A bank statement later confirms the same entry: both links are kept.
    await linkTransactions([{ id: t!.id, bankRef: 'stmt-1' }])
    await linkEmails([{ id: t!.id, emailRef: 'email-abc' }])
    expect(await db.transactions.get(t!.id)).toMatchObject({
      bankRef: 'stmt-1',
      emailRef: 'email-abc',
    })

    // Editing the entry in the form must not drop either link.
    const { updateTransaction } = await import('./repo')
    const edited = await updateTransaction(t!.id, {
      type: 'expense',
      amount: 45_000,
      description: 'Swiggy dinner',
      categoryId: 'cat-food',
      accountId: 'acc-hdfc',
      date: '2026-11-10',
    })
    expect(edited).toMatchObject({ bankRef: 'stmt-1', emailRef: 'email-abc' })
  })

  it('corrects the amount from the email without touching the bank link', async () => {
    const { applyEmailAmount } = await import('./reconcile')
    const t = await addTransaction({
      type: 'expense',
      amount: 44_000,
      description: 'Swiggy',
      categoryId: 'cat-food',
      accountId: 'acc-hdfc',
      date: '2026-11-10',
    })
    await db.transactions.update(t.id, { bankRef: 'stmt-2' })
    await applyEmailAmount(t.id, 45_000, 'email-xyz')
    expect(await db.transactions.get(t.id)).toMatchObject({
      amount: 45_000,
      bankRef: 'stmt-2',
      emailRef: 'email-xyz',
    })
  })
})

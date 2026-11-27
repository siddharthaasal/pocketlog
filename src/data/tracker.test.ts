import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { readBackupText } from '../domain/backup'
import { ValidationError } from '../domain/errors'
import { holdingSchema, valuationSchema } from '../domain/types'
import { applyMerge, collectData, deleteAllData, exportBackupText } from './backup'
import Dexie from 'dexie'
import { createDatabase, db } from './db'
import {
  addFromSuggestion,
  ignoreRecurring,
  linkCharges,
  saveSubscription,
  unignoreRecurring,
} from './subscriptions'
import { suggestRecurring } from '../domain/recurring'
import { markRenewed, savePolicy } from './policies'
import { saveHolding, saveValuations, setHoldingArchived } from './investments'
import { monthRowId, removeRecord, saveAccountBalance, saveRecord } from './records'
import { addTransaction, updateTransaction } from './repo'

const lunch = {
  type: 'expense' as const,
  amount: 35000,
  description: 'Lunch',
  categoryId: 'cat-food',
  accountId: 'acc-hdfc',
  date: '2026-11-02',
}

const holdingFields = { name: 'Nifty index fund', kind: 'mutual_fund', assetClass: 'equity' }

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('saveRecord', () => {
  it('creates, updates in place and keeps createdAt', async () => {
    const first = await saveRecord(db.holdings, holdingSchema, {
      ...holdingFields,
      archived: false,
    })
    const second = await saveRecord(db.holdings, holdingSchema, { name: 'Nifty 50 fund' }, first.id)
    expect(second.createdAt).toBe(first.createdAt)
    expect(second.name).toBe('Nifty 50 fund')
    expect(second.kind).toBe('mutual_fund')
    expect(await db.holdings.count()).toBe(1)
  })

  it('uses one row per owner and month when given a deterministic id', async () => {
    const holding = await saveRecord(db.holdings, holdingSchema, {
      ...holdingFields,
      archived: false,
    })
    const id = monthRowId('val', holding.id, '2026-11')
    const fields = { holdingId: holding.id, month: '2026-11', invested: 100_00, value: 120_00 }
    await saveRecord(db.valuations, valuationSchema, fields, id)
    await saveRecord(db.valuations, valuationSchema, { ...fields, value: 130_00 }, id)
    expect(await db.valuations.count()).toBe(1)
    expect((await db.valuations.get(id))?.value).toBe(130_00)
  })

  it('soft deletes, and saving again brings the record back', async () => {
    const h = await saveRecord(db.holdings, holdingSchema, { ...holdingFields, archived: false })
    await removeRecord(db.holdings, h.id)
    expect((await db.holdings.get(h.id))?.deletedAt).toBeDefined()
    await saveRecord(db.holdings, holdingSchema, {}, h.id)
    expect((await db.holdings.get(h.id))?.deletedAt).toBeUndefined()
  })

  it('rejects invalid values', async () => {
    await expect(
      saveRecord(db.valuations, valuationSchema, {
        holdingId: 'h',
        month: '2026-13',
        invested: 1,
        value: 1,
      }),
    ).rejects.toThrow()
  })
})

describe('refunds', () => {
  it('links an income entry to the expense it refunds', async () => {
    const expense = await addTransaction(lunch)
    const refund = await addTransaction({
      type: 'income',
      amount: 35000,
      description: 'Refund',
      categoryId: 'cat-food',
      accountId: 'acc-hdfc',
      date: '2026-11-04',
      refundOf: expense.id,
    })
    expect(refund.refundOf).toBe(expense.id)
  })

  it('requires an expense to refund and an expense category', async () => {
    const base = {
      type: 'income' as const,
      amount: 100,
      description: 'x',
      accountId: 'acc-hdfc',
      date: '2026-11-04',
    }
    await expect(
      addTransaction({ ...base, categoryId: 'cat-food', refundOf: 'missing' }),
    ).rejects.toBeInstanceOf(ValidationError)
    const expense = await addTransaction(lunch)
    await expect(
      addTransaction({ ...base, categoryId: 'cat-salary', refundOf: expense.id }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('does not allow an expense to be a refund', async () => {
    await expect(addTransaction({ ...lunch, refundOf: 'x' })).rejects.toThrow()
  })

  it('keeps links when a transaction is edited', async () => {
    const expense = await addTransaction(lunch)
    const refund = await addTransaction({
      type: 'income',
      amount: 100,
      description: 'Refund',
      categoryId: 'cat-food',
      accountId: 'acc-hdfc',
      date: '2026-11-04',
      refundOf: expense.id,
    })
    const edited = await updateTransaction(refund.id, {
      type: 'income',
      amount: 200,
      description: 'Refund',
      categoryId: 'cat-food',
      accountId: 'acc-hdfc',
      date: '2026-11-04',
      refundOf: expense.id,
    })
    expect(edited.refundOf).toBe(expense.id)
  })

  it('rejects a loan or holding link that does not exist', async () => {
    await expect(addTransaction({ ...lunch, loanId: 'nope' })).rejects.toBeInstanceOf(
      ValidationError,
    )
    await expect(addTransaction({ ...lunch, holdingId: 'nope' })).rejects.toBeInstanceOf(
      ValidationError,
    )
  })
})

describe('balance checkpoints', () => {
  it('stores one checkpoint per account and date', async () => {
    await saveAccountBalance('acc-hdfc', '2026-11-30', 25_000_00, 'reconcile')
    await saveAccountBalance('acc-hdfc', '2026-11-30', 26_000_00, 'manual')
    const rows = await db.accountBalances.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ balance: 26_000_00, source: 'manual' })
  })
})

describe('backup with the finance tables', () => {
  it('round-trips and restores every new table', async () => {
    const holding = await saveRecord(db.holdings, holdingSchema, {
      ...holdingFields,
      archived: false,
    })
    await saveRecord(
      db.valuations,
      valuationSchema,
      { holdingId: holding.id, month: '2026-11', invested: 100, value: 150 },
      monthRowId('val', holding.id, '2026-11'),
    )
    await saveAccountBalance('acc-hdfc', '2026-11-30', 1000, 'manual')

    const result = await readBackupText(await exportBackupText())
    if (result.status !== 'ok') throw new Error(result.status)
    expect(result.invalid).toEqual([])
    expect(result.backup.format).toBe(2)

    await deleteAllData()
    const plan = await applyMerge(result.backup.data)
    expect(plan.counts.holdings.added).toBe(1)
    expect(plan.counts.valuations.added).toBe(1)
    expect(plan.counts.accountBalances.added).toBe(1)
    const data = await collectData()
    expect(data.holdings).toHaveLength(1)
    expect(data.valuations).toHaveLength(1)
  })

  it('still reads a version 1 file, with the new lists empty', async () => {
    const old = JSON.stringify({
      app: 'pocketlog',
      format: 1,
      exportedAt: '2026-11-01T00:00:00.000Z',
      data: { transactions: [], categories: [], accounts: [], inbox: [] },
    })
    const result = await readBackupText(old)
    expect(result.status).toBe('ok')
    if (result.status === 'ok') expect(result.backup.data.holdings).toEqual([])
  })
})

describe('upgrading an existing database', () => {
  it('keeps version 1 rows and adds the new tables', async () => {
    const name = 'legacy-pocketlog'
    await Dexie.delete(name)
    const old = new Dexie(name)
    old.version(1).stores({
      transactions:
        'id, date, [date+createdAt], type, categoryId, accountId, toAccountId, updatedAt',
      categories: 'id, type, updatedAt',
      accounts: 'id, updatedAt',
      inbox: 'key, recordedAt',
      meta: 'key',
    })
    await old.table('transactions').put({ id: 't1', date: '2026-11-01', amount: 100 })
    old.close()

    const upgraded = createDatabase(name)
    await upgraded.open()
    expect(await upgraded.transactions.get('t1')).toMatchObject({ amount: 100 })
    expect(await upgraded.holdings.count()).toBe(0)
    await upgraded.delete()
  })
})

describe('investments data', () => {
  it('saves a month of values together and replaces them on a second save', async () => {
    const a = await saveHolding({ name: 'A', kind: 'stock', assetClass: 'equity' })
    const b = await saveHolding({ name: 'B', kind: 'fd', assetClass: 'debt' })
    await saveValuations('2026-11', [
      { holdingId: a.id, invested: 100, value: 120 },
      { holdingId: b.id, invested: 50, value: 52 },
    ])
    await saveValuations('2026-11', [{ holdingId: a.id, invested: 100, value: 130 }])
    expect(await db.valuations.count()).toBe(2)
    expect((await db.valuations.get(monthRowId('val', a.id, '2026-11')))?.value).toBe(130)
  })

  it('archives and restores a holding', async () => {
    const h = await saveHolding({ name: 'A', kind: 'stock', assetClass: 'equity' })
    expect((await setHoldingArchived(h.id, true)).archived).toBe(true)
    expect((await setHoldingArchived(h.id, false)).archived).toBe(false)
  })
})

describe('subscriptions data', () => {
  const netflix = (date: string) => ({
    type: 'expense' as const,
    amount: 649_00,
    description: 'Netflix',
    categoryId: 'cat-subscriptions',
    accountId: 'acc-hdfc',
    date,
  })

  it('turns a detected pattern into a subscription and links its charges', async () => {
    const txs = [
      await addTransaction(netflix('2026-09-05')),
      await addTransaction(netflix('2026-10-05')),
      await addTransaction(netflix('2026-11-05')),
    ]
    const found = suggestRecurring(txs, new Set(), '2026-11-27')
    expect(found).toHaveLength(1)

    const sub = await addFromSuggestion(found[0]!)
    expect(sub).toMatchObject({ service: 'Netflix', billing: 'monthly', status: 'active' })
    expect(sub.accountId).toBe('acc-hdfc')
    const linked = await db.transactions.where('subscriptionId').equals(sub.id).count()
    expect(linked).toBe(3)
    expect((await db.subscriptions.get(sub.id))?.nextRenewal).toBe('2026-12-05')
    // Once linked, the same pattern is no longer suggested.
    const after = await db.transactions.toArray()
    expect(suggestRecurring(after, new Set(), '2026-11-27')).toEqual([])
  })

  it('moves the renewal forward when a later charge is linked', async () => {
    const sub = await saveSubscription({
      service: 'Netflix',
      kind: 'entertainment',
      cost: 649_00,
      billing: 'monthly',
      nextRenewal: '2026-11-05',
    })
    const t = await addTransaction(netflix('2026-11-05'))
    await linkCharges(sub.id, [t.id])
    expect((await db.subscriptions.get(sub.id))?.nextRenewal).toBe('2026-12-05')
  })

  it('remembers payees you said are not subscriptions', async () => {
    await ignoreRecurring('cafe')
    await ignoreRecurring('cafe')
    expect((await db.meta.get('subscriptions.ignore'))?.value).toEqual(['cafe'])
    await unignoreRecurring('cafe')
    expect((await db.meta.get('subscriptions.ignore'))?.value).toEqual([])
  })
})

describe('policies data', () => {
  it('moves the renewal a period on when a premium is marked paid', async () => {
    const policy = await savePolicy({
      name: 'Term cover',
      kind: 'term',
      insurer: 'HDFC Life',
      premium: 18_000_00,
      frequency: 'yearly',
      renewalDate: '2026-12-12',
    })
    await markRenewed(policy.id, '2026-11-27')
    expect((await db.policies.get(policy.id))?.renewalDate).toBe('2027-12-12')
  })

  it('rejects a policy with no premium', async () => {
    await expect(
      savePolicy({ name: 'x', kind: 'health', insurer: 'y', premium: 0, frequency: 'yearly' }),
    ).rejects.toThrow()
  })
})

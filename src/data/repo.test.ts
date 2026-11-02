import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ValidationError } from '../domain/errors'
import { db } from './db'
import {
  addAccount,
  addCategory,
  addTransaction,
  deleteTransaction,
  pickDefaultAccount,
  updateAccount,
  updateTransaction,
} from './repo'
import { SEED_ACCOUNTS, SEED_CATEGORIES } from './seed'

const lunch = {
  type: 'expense' as const,
  amount: 35000,
  description: 'Lunch',
  categoryId: 'cat-food',
  accountId: 'acc-hdfc',
  date: '2026-11-02',
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('database', () => {
  it('seeds default categories and accounts with stable ids', async () => {
    expect(await db.categories.count()).toBe(SEED_CATEGORIES.length)
    expect(await db.accounts.count()).toBe(SEED_ACCOUNTS.length)
    expect(await db.categories.get('cat-food')).toMatchObject({ name: 'Food & Dining' })
  })
})

describe('transactions', () => {
  it('adds a transaction with metadata', async () => {
    const t = await addTransaction(lunch)
    expect(t).toMatchObject({ ...lunch, currency: 'INR', source: 'manual', needsReview: false })
    expect(t.id).toMatch(/[0-9a-f-]{36}/)
    expect(await db.transactions.get(t.id)).toEqual(t)
  })

  it('gives every transaction a unique id', async () => {
    const a = await addTransaction(lunch)
    const b = await addTransaction(lunch)
    expect(a.id).not.toBe(b.id)
    expect(await db.transactions.count()).toBe(2)
  })

  it('rejects unknown accounts and mismatched categories without writing', async () => {
    await expect(addTransaction({ ...lunch, accountId: 'nope' })).rejects.toBeInstanceOf(
      ValidationError,
    )
    await expect(addTransaction({ ...lunch, categoryId: 'cat-salary' })).rejects.toThrow(
      /expense category/,
    )
    expect(await db.transactions.count()).toBe(0)
  })

  it('updates fields, keeps createdAt and clears needsReview', async () => {
    const t = await addTransaction(lunch, { source: 'siri', needsReview: true })
    const updated = await updateTransaction(t.id, { ...lunch, amount: 40000, merchant: 'Cafe' })
    expect(updated).toMatchObject({ amount: 40000, merchant: 'Cafe', source: 'siri' })
    expect(updated.needsReview).toBe(false)
    expect(updated.createdAt).toBe(t.createdAt)
  })

  it('removes optional fields that are cleared on edit', async () => {
    const t = await addTransaction({ ...lunch, merchant: 'Cafe' })
    const updated = await updateTransaction(t.id, lunch)
    expect(updated.merchant).toBeUndefined()
  })

  it('soft-deletes so the deletion can sync later', async () => {
    const t = await addTransaction(lunch)
    await deleteTransaction(t.id)
    const stored = await db.transactions.get(t.id)
    expect(stored?.deletedAt).toBeDefined()
    await expect(updateTransaction(t.id, lunch)).rejects.toThrow(/no longer exists/)
  })
})

describe('categories and accounts', () => {
  it('rejects duplicate category names within a type', async () => {
    await expect(
      addCategory({
        name: 'food & dining',
        type: 'expense',
        icon: '🍕',
        color: '#000000',
        keywords: [],
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('keeps exactly one default account', async () => {
    const wallet = await addAccount({
      name: 'Paytm',
      type: 'wallet',
      openingBalance: 0,
      aliases: ['paytm'],
      isDefault: true,
    })
    const accounts = await db.accounts.toArray()
    expect(accounts.filter((a) => a.isDefault).map((a) => a.id)).toEqual([wallet.id])
  })

  it('archiving the default account falls back to another active account', async () => {
    await updateAccount('acc-hdfc', { archived: true })
    const accounts = await db.accounts.toArray()
    expect(accounts.some((a) => a.isDefault)).toBe(false)
    expect(pickDefaultAccount(accounts)?.archived).toBe(false)
  })
})

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ValidationError } from '../domain/errors'
import { db } from './db'
import {
  addAccount,
  addCategory,
  addTransaction,
  bulkUpdateTransactions,
  deleteTransaction,
  deleteTransactions,
  pickDefaultAccount,
  setCategoryBudgets,
  updateAccount,
  updateCategory,
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

  it('saves a transfer between two existing accounts', async () => {
    const t = await addTransaction({
      type: 'transfer',
      amount: 1_000_000,
      description: 'ATM',
      accountId: 'acc-hdfc',
      toAccountId: 'acc-cash',
      date: '2026-11-02',
    })
    expect(t).toMatchObject({ type: 'transfer', toAccountId: 'acc-cash' })
    expect(t.categoryId).toBeUndefined()
    await expect(
      addTransaction({ ...lunch, type: 'transfer', categoryId: undefined, toAccountId: 'nope' }),
    ).rejects.toBeInstanceOf(ValidationError)
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

describe('category budgets', () => {
  it('sets and clears several budgets together, and never on income categories', async () => {
    await setCategoryBudgets([
      { id: 'cat-food', budget: 8_000_00 },
      { id: 'cat-fuel', budget: 3_000_00 },
      { id: 'cat-salary', budget: 1_00 },
    ])
    expect((await db.categories.get('cat-food'))?.budget).toBe(8_000_00)
    expect((await db.categories.get('cat-salary'))?.budget).toBeUndefined()

    const before = (await db.categories.get('cat-fuel'))!.updatedAt
    await setCategoryBudgets([
      { id: 'cat-food', budget: undefined },
      { id: 'cat-fuel', budget: 3_000_00 },
    ])
    expect((await db.categories.get('cat-food'))?.budget).toBeUndefined()
    // Unchanged budgets aren't rewritten, so a sync doesn't see an edit.
    expect((await db.categories.get('cat-fuel'))?.updatedAt).toBe(before)
  })

  it('drops a budget from an income category when saving it', async () => {
    const c = await addCategory({
      name: 'Bonus',
      type: 'income',
      icon: 'gift',
      color: '#2f9e44',
      keywords: [],
      budget: 5_00,
    })
    expect(c.budget).toBeUndefined()
    await updateCategory('cat-food', { budget: 4_000_00 })
    expect((await db.categories.get('cat-food'))?.budget).toBe(4_000_00)
  })

  it('rejects a budget of zero or less', async () => {
    await expect(updateCategory('cat-food', { budget: 0 })).rejects.toThrow()
  })
})

describe('splits and bulk changes', () => {
  it('saves a split, and rejects a part with no expense category', async () => {
    const t = await addTransaction({
      ...lunch,
      amount: 1000_00,
      categoryId: 'cat-food',
      splits: [
        { categoryId: 'cat-food', amount: 600_00 },
        { categoryId: 'cat-groceries', amount: 400_00 },
      ],
    })
    expect(t.splits).toHaveLength(2)
    await expect(
      addTransaction({
        ...lunch,
        amount: 1000_00,
        splits: [
          { categoryId: 'cat-food', amount: 600_00 },
          { categoryId: 'cat-salary', amount: 400_00 },
        ],
      }),
    ).rejects.toThrow(/expense category/)
  })

  it('changes several at once and leaves the ones it does not fit', async () => {
    const a = await addTransaction({ ...lunch, tags: ['work'] })
    const b = await addTransaction({ ...lunch, description: 'Dinner' })
    const pay = await addTransaction({
      type: 'income',
      amount: 100_00,
      description: 'Pay',
      categoryId: 'cat-salary',
      accountId: 'acc-hdfc',
      date: '2026-11-02',
    })
    const move = await addTransaction({
      type: 'transfer',
      amount: 100_00,
      description: 'ATM',
      accountId: 'acc-hdfc',
      toAccountId: 'acc-cash',
      date: '2026-11-02',
    })
    const all = [a.id, b.id, pay.id, move.id]

    expect(
      await bulkUpdateTransactions(all, { kind: 'category', categoryId: 'cat-groceries' }),
    ).toEqual({ updated: 2, skipped: 2 })
    expect((await db.transactions.get(b.id))?.categoryId).toBe('cat-groceries')
    expect((await db.transactions.get(pay.id))?.categoryId).toBe('cat-salary')

    // The transfer already goes to Cash, so it can't also come from it.
    expect(await bulkUpdateTransactions(all, { kind: 'account', accountId: 'acc-cash' })).toEqual({
      updated: 3,
      skipped: 1,
    })

    expect(await bulkUpdateTransactions(all, { kind: 'addTag', tag: ' Work ' })).toEqual({
      updated: 3,
      skipped: 1,
    })
    expect((await db.transactions.get(b.id))?.tags).toEqual(['work'])
    await bulkUpdateTransactions(all, { kind: 'removeTag', tag: 'work' })
    expect((await db.transactions.get(a.id))?.tags).toBeUndefined()

    await deleteTransactions([a.id, b.id])
    expect((await db.transactions.get(a.id))?.deletedAt).toBeDefined()
    expect((await db.transactions.get(pay.id))?.deletedAt).toBeUndefined()
  })
})

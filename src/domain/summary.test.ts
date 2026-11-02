import { describe, expect, it } from 'vitest'
import { summarize } from './summary'
import { makeTransaction as tx } from '../test/factories'

describe('summarize', () => {
  it('totals income and expenses', () => {
    const s = summarize([
      tx({ amount: 35000 }),
      tx({ amount: 15000, categoryId: 'cat-transport' }),
      tx({ type: 'income', amount: 500000, categoryId: 'cat-salary' }),
    ])
    expect(s).toMatchObject({ income: 500000, expense: 50000, net: 450000 })
  })

  it('never counts transfers as income or expense', () => {
    const s = summarize([
      tx({ type: 'transfer', amount: 1000000, categoryId: undefined, toAccountId: 'acc-cash' }),
    ])
    expect(s).toMatchObject({ income: 0, expense: 0, net: 0, expenseByCategory: [] })
  })

  it('ignores deleted transactions', () => {
    const s = summarize([tx({ amount: 999, deletedAt: '2026-11-02T00:00:00.000Z' })])
    expect(s.expense).toBe(0)
  })

  it('breaks expenses down by category, largest first', () => {
    const s = summarize([
      tx({ amount: 100, categoryId: 'cat-food' }),
      tx({ amount: 500, categoryId: 'cat-rent' }),
      tx({ amount: 200, categoryId: 'cat-food' }),
    ])
    expect(s.expenseByCategory).toEqual([
      { categoryId: 'cat-rent', amount: 500 },
      { categoryId: 'cat-food', amount: 300 },
    ])
  })
})

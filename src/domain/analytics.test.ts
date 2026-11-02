import { describe, expect, it } from 'vitest'
import { makeTransaction, makeTransfer } from '../test/factories'
import { compareCategories, monthlyTotals, percentChange } from './analytics'

describe('monthlyTotals', () => {
  it('returns every month in range, oldest first, including empty ones', () => {
    const result = monthlyTotals(
      [
        makeTransaction({ date: '2026-11-02', amount: 300 }),
        makeTransaction({ date: '2026-09-10', amount: 100 }),
        makeTransaction({
          type: 'income',
          categoryId: 'cat-salary',
          date: '2026-09-01',
          amount: 1000,
        }),
        makeTransaction({ date: '2025-01-01', amount: 999 }), // out of range
      ],
      '2026-11',
      3,
    )
    expect(result).toEqual([
      { month: '2026-09', income: 1000, expense: 100, net: 900 },
      { month: '2026-10', income: 0, expense: 0, net: 0 },
      { month: '2026-11', income: 0, expense: 300, net: -300 },
    ])
  })

  it('crosses year boundaries and excludes transfers', () => {
    const result = monthlyTotals(
      [makeTransfer('a', 'b', 500, { date: '2026-01-05' })],
      '2026-01',
      2,
    )
    expect(result.map((m) => m.month)).toEqual(['2025-12', '2026-01'])
    expect(result[1]).toMatchObject({ income: 0, expense: 0 })
  })
})

describe('compareCategories', () => {
  it('lines up categories across two periods, including ones that disappeared', () => {
    const current = [
      makeTransaction({ categoryId: 'cat-food', amount: 500 }),
      makeTransaction({ categoryId: 'cat-fuel', amount: 200 }),
    ]
    const previous = [
      makeTransaction({ categoryId: 'cat-food', amount: 300 }),
      makeTransaction({ categoryId: 'cat-travel', amount: 900 }),
    ]
    expect(compareCategories(current, previous)).toEqual([
      { categoryId: 'cat-food', current: 500, previous: 300 },
      { categoryId: 'cat-fuel', current: 200, previous: 0 },
      { categoryId: 'cat-travel', current: 0, previous: 900 },
    ])
  })
})

describe('percentChange', () => {
  it('handles growth, decline and a zero baseline', () => {
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(50, 100)).toBe(-50)
    expect(percentChange(100, 0)).toBeNull()
  })
})

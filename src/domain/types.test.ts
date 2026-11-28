import { describe, expect, it } from 'vitest'
import { toFieldErrors } from './errors'
import { transactionInputSchema } from './types'

const base = {
  type: 'expense' as const,
  amount: 35000,
  description: 'Lunch',
  categoryId: 'cat-food',
  accountId: 'acc-hdfc',
  date: '2026-11-02',
}

function errorsFor(input: unknown) {
  const result = transactionInputSchema.safeParse(input)
  return result.success ? null : toFieldErrors(result.error)
}

describe('transaction validation', () => {
  it('accepts a valid expense', () => {
    expect(errorsFor(base)).toBeNull()
  })

  it('requires a positive integer amount', () => {
    expect(errorsFor({ ...base, amount: 0 })).toHaveProperty('amount')
    expect(errorsFor({ ...base, amount: 12.5 })).toHaveProperty('amount')
  })

  it('requires a category for expenses and income', () => {
    expect(errorsFor({ ...base, categoryId: undefined })).toHaveProperty('categoryId')
  })

  it('requires two different accounts for transfers and no category', () => {
    const transfer = { ...base, type: 'transfer', categoryId: undefined }
    expect(errorsFor({ ...transfer, toAccountId: 'acc-cash' })).toBeNull()
    expect(errorsFor(transfer)).toHaveProperty('toAccountId')
    expect(errorsFor({ ...transfer, toAccountId: 'acc-hdfc' })).toHaveProperty('toAccountId')
    expect(
      errorsFor({ ...transfer, toAccountId: 'acc-cash', categoryId: 'cat-food' }),
    ).toHaveProperty('categoryId')
  })

  it('rejects malformed dates', () => {
    expect(errorsFor({ ...base, date: '2026-13-01' })).toHaveProperty('date')
    expect(errorsFor({ ...base, date: '02/11/2026' })).toHaveProperty('date')
  })
})

describe('split validation', () => {
  const parts = (a: number, b: number, second = 'cat-home') => [
    { categoryId: 'cat-food', amount: a },
    { categoryId: second, amount: b },
  ]
  const split = (extra: object) => errorsFor({ ...base, ...extra })?.splits

  it('accepts parts that add up, led by the category', () => {
    expect(errorsFor({ ...base, splits: parts(30000, 5000) })).toBeNull()
  })

  it('rejects parts that do not hold together', () => {
    expect(split({ splits: parts(30000, 4000) })).toMatch(/add up/)
    expect(split({ splits: [{ categoryId: 'cat-food', amount: 35000 }] })).toMatch(/two parts/)
    expect(split({ splits: parts(30000, 5000, 'cat-food') })).toMatch(/once/)
    expect(split({ categoryId: 'cat-home', splits: parts(30000, 5000) })).toMatch(/first part/)
    expect(split({ type: 'income', splits: parts(30000, 5000) })).toMatch(/Only expenses/)
  })

  it('keeps tags lowercase and short', () => {
    const r = transactionInputSchema.parse({ ...base, tags: [' Goa Trip '] })
    expect(r.tags).toEqual(['goa trip'])
    expect(errorsFor({ ...base, tags: ['x'.repeat(31)] })).not.toBeNull()
  })
})

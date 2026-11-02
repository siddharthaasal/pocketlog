import { describe, expect, it } from 'vitest'
import { makeAccount, makeTransaction, makeTransfer } from '../test/factories'
import { accountBalances, totalBalance } from './balances'
import { summarize } from './summary'

const hdfc = makeAccount({ id: 'hdfc', openingBalance: 50_000_00 })
const cash = makeAccount({ id: 'cash', type: 'cash', openingBalance: 2_000_00 })
const card = makeAccount({ id: 'card', type: 'credit_card', openingBalance: -5_000_00 })
const accounts = [hdfc, cash, card]

describe('accountBalances', () => {
  it('starts from opening balances', () => {
    const b = accountBalances(accounts, [])
    expect(Object.fromEntries(b)).toEqual({ hdfc: 50_000_00, cash: 2_000_00, card: -5_000_00 })
  })

  it('adds income and subtracts expenses on the right account', () => {
    const b = accountBalances(accounts, [
      makeTransaction({
        type: 'income',
        accountId: 'hdfc',
        amount: 85_000_00,
        categoryId: 'cat-salary',
      }),
      makeTransaction({ accountId: 'hdfc', amount: 350_00 }),
      makeTransaction({ accountId: 'cash', amount: 180_00 }),
    ])
    expect(b.get('hdfc')).toBe(50_000_00 + 85_000_00 - 350_00)
    expect(b.get('cash')).toBe(2_000_00 - 180_00)
  })

  it('moves money between accounts on a transfer without changing the total', () => {
    const before = totalBalance(accountBalances(accounts, []))
    const b = accountBalances(accounts, [makeTransfer('hdfc', 'cash', 10_000_00)])
    expect(b.get('hdfc')).toBe(40_000_00)
    expect(b.get('cash')).toBe(12_000_00)
    expect(totalBalance(b)).toBe(before)
  })

  it('tracks a credit card as money owed and paying it off as a transfer', () => {
    const b = accountBalances(accounts, [
      makeTransaction({ accountId: 'card', amount: 1_200_00 }),
      makeTransfer('hdfc', 'card', 6_200_00),
    ])
    expect(b.get('card')).toBe(0)
    expect(b.get('hdfc')).toBe(50_000_00 - 6_200_00)
  })

  it('a card payment is neither income nor expense', () => {
    const s = summarize([makeTransfer('hdfc', 'card', 6_200_00)])
    expect(s).toMatchObject({ income: 0, expense: 0 })
  })

  it('ignores deleted transactions and unknown accounts', () => {
    const b = accountBalances(accounts, [
      makeTransaction({ accountId: 'hdfc', amount: 999, deletedAt: '2026-11-02T00:00:00.000Z' }),
      makeTransaction({ accountId: 'ghost', amount: 999 }),
    ])
    expect(b.get('hdfc')).toBe(50_000_00)
    expect(b.has('ghost')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { makeAccount, makeTransaction } from '../test/factories'
import {
  budgetRows,
  emergencyCover,
  emergencyHoldings,
  monthProgress,
  savingsBalance,
} from './budgets'
import { holdingRows } from './investments'
import type { Category, Holding } from './types'

const STAMP = '2026-11-01T00:00:00.000Z'
const category = (id: string, extra: Partial<Category> = {}): Category => ({
  id,
  name: id,
  type: 'expense',
  icon: 'tag',
  color: '#868e96',
  keywords: [],
  archived: false,
  createdAt: STAMP,
  updatedAt: STAMP,
  ...extra,
})

describe('budgetRows', () => {
  it('compares spending with each budget, most used first', () => {
    const rows = budgetRows(
      [
        category('food', { budget: 10_000_00 }),
        category('fuel', { budget: 2_000_00 }),
        category('fun', { budget: 5_000_00 }),
        category('none'),
        category('old', { budget: 1_00, archived: true }),
        category('salary', { type: 'income', budget: 1_00 }),
      ],
      [
        { categoryId: 'food', amount: 7_000_00 },
        { categoryId: 'fuel', amount: 2_500_00 },
        { categoryId: 'fun', amount: 4_000_00 },
        { categoryId: 'none', amount: 9_999_00 },
      ],
    )
    expect(rows.map((r) => [r.category.id, r.status])).toEqual([
      ['fuel', 'over'],
      ['fun', 'near'],
      ['food', 'ok'],
    ])
    expect(rows[0]).toMatchObject({ spent: 2_500_00, left: -500_00, used: 1.25 })
  })

  it('counts a budget with nothing spent as unused', () => {
    const [row] = budgetRows([category('food', { budget: 100_00 })], [])
    expect(row).toMatchObject({ spent: 0, left: 100_00, used: 0, status: 'ok' })
  })
})

describe('monthProgress', () => {
  it('is the share of the month gone by', () => {
    expect(monthProgress('2026-11', '2026-11-15')).toBe(0.5)
    expect(monthProgress('2026-02', '2026-02-28')).toBe(1)
    expect(monthProgress('2026-10', '2026-11-15')).toBe(1)
    expect(monthProgress('2026-12', '2026-11-15')).toBe(0)
  })
})

describe('emergency fund', () => {
  it('counts bank, cash and wallet balances only', () => {
    const accounts = [
      makeAccount({ id: 'bank' }),
      makeAccount({ id: 'wallet', type: 'wallet' }),
      makeAccount({ id: 'card', type: 'credit_card' }),
      makeAccount({ id: 'demat', type: 'investment' }),
      makeAccount({ id: 'closed', archived: true }),
    ]
    const balances = new Map([
      ['bank', 100_000_00],
      ['wallet', 2_000_00],
      ['card', -30_000_00],
      ['demat', 500_000_00],
      ['closed', 9_00],
    ])
    expect(savingsBalance(accounts, balances)).toBe(102_000_00)
  })

  it('counts holdings marked as emergency money, at their latest value', () => {
    const h = (id: string, extra: Partial<Holding> = {}) =>
      ({
        id,
        name: id,
        kind: 'mutual_fund',
        assetClass: 'debt',
        archived: false,
        createdAt: STAMP,
        updatedAt: STAMP,
        ...extra,
      }) as Holding
    const v = (holdingId: string, month: string, value: number) => ({
      id: `${holdingId}-${month}`,
      holdingId,
      month,
      invested: 0,
      value,
      createdAt: STAMP,
      updatedAt: STAMP,
    })
    const rows = holdingRows(
      [
        h('liquid', { emergency: true }),
        h('equity'),
        h('old', { emergency: true, archived: true }),
      ],
      [
        v('liquid', '2026-10', 90_000_00),
        v('liquid', '2026-11', 100_000_00),
        v('equity', '2026-11', 5_00),
        v('old', '2026-11', 7_00),
      ],
    )
    expect(emergencyHoldings(rows).map((r) => [r.holding.id, r.value])).toEqual([
      ['liquid', 100_000_00],
    ])
  })

  it('divides savings by the average of the full months before this one', () => {
    const transactions = [
      makeTransaction({ date: '2026-09-10', amount: 40_000_00 }),
      makeTransaction({ date: '2026-10-10', amount: 60_000_00 }),
      // This month is still running, so it is left out.
      makeTransaction({ date: '2026-11-02', amount: 500_000_00 }),
    ]
    const cover = emergencyCover(300_000_00, transactions, '2026-11')
    expect(cover).toMatchObject({ monthlySpend: 50_000_00, monthsUsed: 2, months: 6 })
  })

  it('nets refunds and has no answer before a full month of spending', () => {
    const spend = makeTransaction({ id: 'e', date: '2026-10-05', amount: 10_000_00 })
    const refund = makeTransaction({
      type: 'income',
      date: '2026-10-08',
      amount: 2_000_00,
      refundOf: 'e',
    })
    expect(emergencyCover(16_000_00, [spend, refund], '2026-11').months).toBe(2)
    expect(emergencyCover(16_000_00, [], '2026-11').months).toBeNull()
  })
})

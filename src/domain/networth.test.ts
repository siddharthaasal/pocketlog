import { describe, expect, it } from 'vitest'
import { makeAccount, makeTransaction } from '../test/factories'
import {
  changeOver,
  computeLines,
  emptyLines,
  savingsRate,
  snapshotRows,
  summarizeLines,
} from './networth'
import type { Holding, Loan, LoanBalance, NetWorthSnapshot, Valuation } from './types'

const STAMP = '2026-11-01T00:00:00.000Z'
const stamp = { createdAt: STAMP, updatedAt: STAMP }
const holding = (id: string, kind: Holding['kind'], extra: Partial<Holding> = {}): Holding => ({
  id,
  name: id,
  kind,
  assetClass: 'equity',
  archived: false,
  ...stamp,
  ...extra,
})
const val = (holdingId: string, month: string, invested: number, value: number): Valuation => ({
  id: `${holdingId}-${month}`,
  holdingId,
  month,
  invested,
  value,
  ...stamp,
})
const loan = (id: string, extra: Partial<Loan> = {}): Loan => ({
  id,
  name: id,
  direction: 'owe',
  kind: 'personal',
  active: true,
  ...stamp,
  ...extra,
})
const bal = (loanId: string, month: string, outstanding: number): LoanBalance => ({
  id: `${loanId}-${month}`,
  loanId,
  month,
  outstanding,
  ...stamp,
})

describe('computeLines', () => {
  const accounts = [
    makeAccount({ id: 'hdfc', openingBalance: 10_000_00 }),
    makeAccount({ id: 'cash', type: 'cash', openingBalance: 500_00 }),
    makeAccount({ id: 'card', type: 'credit_card', openingBalance: 0 }),
    makeAccount({ id: 'inv', type: 'investment' }),
  ]
  const transactions = [
    makeTransaction({ accountId: 'hdfc', amount: 1_000_00, date: '2026-11-05' }),
    makeTransaction({ accountId: 'card', amount: 2_000_00, date: '2026-11-06' }),
    makeTransaction({ accountId: 'hdfc', amount: 99_00, date: '2026-12-01' }),
  ]

  it('takes savings and card dues from accounts as of month end', () => {
    const { lines } = computeLines('2026-11', {
      accounts,
      transactions,
      holdings: [],
      valuations: [],
      loans: [],
      loanBalances: [],
    })
    expect(lines.savings).toBe(10_000_00 - 1_000_00 + 500_00)
    expect(lines.card_dues).toBe(2_000_00)
  })

  it('puts holdings and loans into their lines', () => {
    const { lines, invested, staleHoldings, staleLoans } = computeLines('2026-11', {
      accounts: [],
      transactions: [],
      holdings: [
        holding('mf', 'mutual_fund'),
        holding('etf', 'etf'),
        holding('fd', 'fd'),
        holding('house', 'property'),
      ],
      valuations: [
        val('mf', '2026-11', 90, 100),
        val('etf', '2026-10', 40, 50),
        val('fd', '2026-11', 20, 21),
        val('house', '2026-11', 0, 5000),
      ],
      loans: [
        loan('home', { kind: 'home' }),
        loan('car', { kind: 'car' }),
        loan('rohan', { direction: 'owed' }),
      ],
      loanBalances: [
        bal('home', '2026-11', 700),
        bal('car', '2026-10', 60),
        bal('rohan', '2026-11', 30),
      ],
    })
    expect(lines).toMatchObject({
      mutual_fund: 100,
      stock: 50,
      fd: 21,
      property: 5000,
      home_loan: 700,
      other_loans: 60,
      money_lent: 30,
    })
    expect(invested).toBe(90 + 40 + 20)
    expect(staleHoldings.map((h) => h.id)).toEqual(['etf'])
    expect(staleLoans.map((l) => l.id)).toEqual(['car'])
  })

  it('counts sold holdings and closed loans only in months they have a figure', () => {
    const sources = {
      accounts: [],
      transactions: [],
      holdings: [holding('old', 'stock', { archived: true })],
      valuations: [val('old', '2026-09', 10, 20)],
      loans: [loan('done', { active: false })],
      loanBalances: [bal('done', '2026-09', 5)],
    }
    expect(computeLines('2026-09', sources).lines).toMatchObject({ stock: 20, other_loans: 5 })
    const later = computeLines('2026-11', sources)
    expect(later.lines).toMatchObject({ stock: 0, other_loans: 0 })
    expect(later.staleHoldings).toEqual([])
    expect(later.staleLoans).toEqual([])
  })
})

describe('summarizeLines', () => {
  it('works out assets, liabilities, net worth and investments', () => {
    const lines = {
      ...emptyLines(),
      savings: 100,
      mutual_fund: 200,
      property: 1000,
      money_lent: 50,
      home_loan: 600,
      card_dues: 10,
    }
    expect(summarizeLines(lines)).toEqual({
      assets: 1350,
      liabilities: 610,
      netWorth: 740,
      investments: 200,
    })
  })
})

describe('snapshots', () => {
  const snap = (month: string, savings: number, loans = 0, invested = 0): NetWorthSnapshot => ({
    id: month,
    month,
    lines: {
      ...emptyLines(),
      savings,
      mutual_fund: invested ? invested + 10 : 0,
      other_loans: loans,
    },
    totalInvested: invested,
    closedAt: STAMP,
    ...stamp,
  })
  const rows = snapshotRows([snap('2026-11', 150), snap('2025-11', 100), snap('2026-10', 130, 5)])

  it('orders months and works out the change from the previous one', () => {
    expect(rows.map((r) => r.month)).toEqual(['2025-11', '2026-10', '2026-11'])
    expect(rows.map((r) => r.change)).toEqual([null, 25, 25])
  })

  it('compares with a month a year back, only when it was closed', () => {
    expect(changeOver(rows, 12)).toBe(50)
    expect(changeOver(rows, 1)).toBe(25)
    expect(changeOver(rows, 3)).toBeNull()
    expect(changeOver([], 1)).toBeNull()
  })

  it('works out growth as investment value minus what went in', () => {
    const [r] = snapshotRows([snap('2026-11', 0, 0, 1000)])
    expect(r!.growth).toBe(10)
  })
})

describe('savingsRate', () => {
  it('is what was saved divided by what was earned, over months with activity', () => {
    const txs = [
      makeTransaction({
        type: 'income',
        amount: 100_000_00,
        categoryId: 'cat-salary',
        date: '2026-10-01',
      }),
      makeTransaction({ amount: 60_000_00, date: '2026-10-10' }),
      makeTransaction({
        type: 'income',
        amount: 100_000_00,
        categoryId: 'cat-salary',
        date: '2026-11-01',
      }),
      makeTransaction({ amount: 40_000_00, date: '2026-11-10' }),
    ]
    expect(savingsRate(txs, '2026-11', 12)).toEqual({ rate: 0.5, months: 2 })
  })

  it('has no rate without income', () => {
    expect(savingsRate([makeTransaction({ date: '2026-11-10' })], '2026-11')).toEqual({
      rate: null,
      months: 1,
    })
  })
})

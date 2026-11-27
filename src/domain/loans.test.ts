import { describe, expect, it } from 'vitest'
import { makeTransaction } from '../test/factories'
import {
  balanceAt,
  estimateOutstanding,
  latestBalances,
  loanRows,
  loanTotals,
  monthsLeft,
  repaymentsOf,
} from './loans'
import type { Loan, LoanBalance } from './types'

const STAMP = '2026-11-01T00:00:00.000Z'
const loan = (id: string, extra: Partial<Loan> = {}): Loan => ({
  id,
  name: id,
  direction: 'owe',
  kind: 'personal',
  active: true,
  createdAt: STAMP,
  updatedAt: STAMP,
  ...extra,
})
const bal = (loanId: string, month: string, outstanding: number): LoanBalance => ({
  id: `${loanId}-${month}`,
  loanId,
  month,
  outstanding,
  createdAt: STAMP,
  updatedAt: STAMP,
})

describe('balances', () => {
  const balances = [bal('a', '2026-09', 900), bal('a', '2026-10', 800), bal('b', '2026-10', 5)]

  it('finds the newest and the one at a month', () => {
    expect(latestBalances(balances).get('a')?.outstanding).toBe(800)
    expect(balanceAt('a', balances, '2026-09')?.outstanding).toBe(900)
    expect(balanceAt('a', balances, '2026-08')).toBeUndefined()
  })

  it('works out how much of the loan is repaid', () => {
    const rows = loanRows([loan('a', { principal: 1000 })], balances, '2026-10')
    expect(rows[0]).toMatchObject({ outstanding: 800, asOf: '2026-10' })
    expect(rows[0]!.repaid).toBeCloseTo(0.2)
  })

  it('has no figures before a balance is entered', () => {
    expect(loanRows([loan('z')], balances, '2026-10')[0]).toMatchObject({
      outstanding: null,
      repaid: null,
    })
  })
})

describe('loanTotals', () => {
  it('splits money lent, home loan and other loans, and ignores closed loans', () => {
    const loans = [
      loan('home', { kind: 'home', emi: 40_000_00 }),
      loan('car', { kind: 'car', emi: 10_000_00 }),
      loan('friend', { direction: 'owed', kind: 'friend_family' }),
      loan('old', { active: false }),
    ]
    const balances = [
      bal('home', '2026-11', 50_00_000_00),
      bal('car', '2026-11', 3_00_000_00),
      bal('friend', '2026-11', 20_000_00),
      bal('old', '2026-11', 999),
    ]
    expect(loanTotals(loanRows(loans, balances, '2026-11'))).toEqual({
      lent: 20_000_00,
      homeLoan: 50_00_000_00,
      otherLoans: 3_00_000_00,
      monthlyEmi: 50_000_00,
    })
  })
})

describe('estimateOutstanding', () => {
  const l = loan('a', { rate: 1200 }) // 12% a year, 1% a month
  const balances = [bal('a', '2026-09', 100_000_00)]

  it('rolls the balance forward with interest and the repayments you tagged', () => {
    const txs = [
      makeTransaction({ loanId: 'a', amount: 10_000_00, date: '2026-10-05' }),
      makeTransaction({ loanId: 'a', amount: 10_000_00, date: '2026-11-05' }),
    ]
    // Oct: 100000 + 1000 - 10000 = 91000. Nov: 91000 + 910 - 10000 = 81910.
    expect(estimateOutstanding(l, balances, txs, '2026-11')).toBe(81_910_00)
  })

  it('never goes below zero', () => {
    const txs = [makeTransaction({ loanId: 'a', amount: 999_999_00, date: '2026-10-05' })]
    expect(estimateOutstanding(l, balances, txs, '2026-10')).toBe(0)
  })

  it('has nothing to say without a balance to start from, or for lent money', () => {
    expect(estimateOutstanding(l, [], [], '2026-11')).toBeNull()
    expect(estimateOutstanding(l, balances, [], '2026-09')).toBeNull()
    expect(estimateOutstanding({ ...l, direction: 'owed' }, balances, [], '2026-11')).toBeNull()
  })
})

describe('other helpers', () => {
  it('lists repayments newest first and skips deleted ones', () => {
    const txs = [
      makeTransaction({ loanId: 'a', date: '2026-10-05' }),
      makeTransaction({ loanId: 'a', date: '2026-11-05' }),
      makeTransaction({ loanId: 'a', date: '2026-11-06', deletedAt: STAMP }),
      makeTransaction({ loanId: 'b', date: '2026-11-07' }),
    ]
    expect(repaymentsOf('a', txs).map((t) => t.date)).toEqual(['2026-11-05', '2026-10-05'])
  })

  it('counts months to the last EMI', () => {
    expect(monthsLeft(loan('a', { endDate: '2027-03-15' }), '2026-11-27')).toBe(4)
    expect(monthsLeft(loan('a', { endDate: '2026-01-01' }), '2026-11-27')).toBe(0)
    expect(monthsLeft(loan('a'), '2026-11-27')).toBeNull()
  })
})

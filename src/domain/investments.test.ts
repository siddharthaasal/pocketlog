import { describe, expect, it } from 'vitest'
import { makeAccount, makeTransfer } from '../test/factories'
import {
  allocation,
  contributedThrough,
  DEFAULT_TARGETS,
  growthInMonth,
  holdingCashFlows,
  holdingRows,
  investedInMonth,
  lastDayOf,
  latestValuations,
  totalRows,
  xirr,
} from './investments'
import type { Holding, Valuation } from './types'

const STAMP = '2026-11-01T00:00:00.000Z'
const holding = (id: string, assetClass: Holding['assetClass'], extra: Partial<Holding> = {}) =>
  ({
    id,
    name: id,
    kind: 'mutual_fund',
    assetClass,
    archived: false,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...extra,
  }) as Holding
const val = (holdingId: string, month: string, invested: number, value: number): Valuation => ({
  id: `${holdingId}-${month}`,
  holdingId,
  month,
  invested,
  value,
  createdAt: STAMP,
  updatedAt: STAMP,
})

describe('holding rows', () => {
  const holdings = [holding('fund', 'equity'), holding('fd', 'debt')]
  const valuations = [
    val('fund', '2026-10', 100_000_00, 110_000_00),
    val('fund', '2026-11', 110_000_00, 125_000_00),
    val('fd', '2026-11', 50_000_00, 51_000_00),
  ]

  it('uses the newest valuation and works out gain and gain %', () => {
    const rows = holdingRows(holdings, valuations)
    expect(rows[0]).toMatchObject({ invested: 110_000_00, value: 125_000_00, gain: 15_000_00 })
    expect(rows[0]!.gainPct).toBeCloseTo(13.636, 2)
    expect(latestValuations(valuations).get('fund')?.month).toBe('2026-11')
  })

  it('can look back to an earlier month', () => {
    expect(holdingRows(holdings, valuations, '2026-10')[0]!.value).toBe(110_000_00)
  })

  it('has no gain % when nothing was invested', () => {
    const rows = holdingRows([holding('x', 'other')], [])
    expect(rows[0]).toMatchObject({ value: 0, gainPct: null, asOf: null })
  })

  it('totals across holdings', () => {
    expect(totalRows(holdingRows(holdings, valuations))).toMatchObject({
      invested: 160_000_00,
      value: 176_000_00,
      gain: 16_000_00,
    })
  })
})

describe('allocation', () => {
  it('compares the actual mix with targets and flags big gaps', () => {
    const rows = holdingRows(
      [holding('fund', 'equity'), holding('fd', 'debt'), holding('gold', 'gold')],
      [
        val('fund', '2026-11', 0, 80_000_00),
        val('fd', '2026-11', 0, 10_000_00),
        val('gold', '2026-11', 0, 10_000_00),
      ],
    )
    const { rows: mix, total } = allocation(rows, 0, DEFAULT_TARGETS)
    expect(total).toBe(100_000_00)
    const by = Object.fromEntries(mix.map((r) => [r.assetClass, r]))
    expect(by.equity).toMatchObject({ actualBps: 8000, targetBps: 6000, status: 'over' })
    expect(by.debt).toMatchObject({ actualBps: 1000, status: 'under' })
    expect(by.gold).toMatchObject({ actualBps: 1000, status: 'on' })
    expect(by.cash).toMatchObject({ actualBps: 0, status: 'under' })
  })

  it('counts savings as cash and ignores archived holdings', () => {
    const rows = holdingRows(
      [holding('a', 'equity'), holding('old', 'equity', { archived: true })],
      [val('a', '2026-11', 0, 90_00), val('old', '2026-11', 0, 999_00)],
    )
    const { rows: mix, total } = allocation(rows, 10_00, DEFAULT_TARGETS)
    expect(total).toBe(100_00)
    expect(mix.find((r) => r.assetClass === 'cash')?.value).toBe(10_00)
  })

  it('has no percentages when there is nothing', () => {
    const { rows } = allocation([], 0, DEFAULT_TARGETS)
    expect(rows.every((r) => r.actualBps === null && r.status === null)).toBe(true)
  })
})

describe('xirr', () => {
  it('finds a 10% annual return over one year', () => {
    const r = xirr([
      { date: '2025-01-01', amount: -100_000 },
      { date: '2026-01-01', amount: 110_000 },
    ])
    expect(r).toBeCloseTo(0.1, 3)
  })

  it('handles several contributions', () => {
    const r = xirr([
      { date: '2025-01-01', amount: -50_000 },
      { date: '2025-07-01', amount: -50_000 },
      { date: '2026-01-01', amount: 112_000 },
    ])!
    expect(r).toBeGreaterThan(0.1)
    expect(r).toBeLessThan(0.2)
  })

  it('can be negative', () => {
    const r = xirr([
      { date: '2025-01-01', amount: -100_000 },
      { date: '2026-01-01', amount: 90_000 },
    ])
    expect(r).toBeCloseTo(-0.1, 3)
  })

  it('has no answer without both an outflow and an inflow, or without time passing', () => {
    expect(xirr([{ date: '2025-01-01', amount: -1 }])).toBeNull()
    expect(
      xirr([
        { date: '2025-01-01', amount: -1 },
        { date: '2025-01-01', amount: 2 },
      ]),
    ).toBeNull()
  })
})

describe('tagged transfers', () => {
  const accounts = new Map(
    [makeAccount({ id: 'bank' }), makeAccount({ id: 'invest', type: 'investment' })].map((a) => [
      a.id,
      a,
    ]),
  )
  const txs = [
    makeTransfer('bank', 'invest', 10_000_00, { holdingId: 'fund', date: '2026-09-05' }),
    makeTransfer('bank', 'invest', 5_000_00, { holdingId: 'fund', date: '2026-11-05' }),
    makeTransfer('invest', 'bank', 2_000_00, { holdingId: 'fund', date: '2026-11-20' }),
    makeTransfer('bank', 'invest', 9_999_00, { holdingId: 'other', date: '2026-11-05' }),
    makeTransfer('bank', 'invest', 1_00, { date: '2026-11-05' }),
  ]

  it('counts deposits in and withdrawals out', () => {
    expect(contributedThrough('fund', txs, accounts, '2026-11')).toBe(13_000_00)
    expect(contributedThrough('fund', txs, accounts, '2026-09')).toBe(10_000_00)
  })

  it('totals what went into holdings in a month', () => {
    expect(investedInMonth(txs, accounts, '2026-11')).toBe(5_000_00 - 2_000_00 + 9_999_00)
  })

  it('builds cash flows ending with the current value', () => {
    const flows = holdingCashFlows('fund', txs, accounts, val('fund', '2026-11', 0, 15_000_00))
    expect(flows.at(-1)).toEqual({ date: '2026-11-30', amount: 15_000_00 })
    expect(flows.filter((f) => f.amount < 0)).toHaveLength(2)
    expect(xirr(flows)).not.toBeNull()
  })
})

describe('growthInMonth', () => {
  it('is the change in value minus what was added', () => {
    const v = [val('a', '2026-10', 100_00, 110_00), val('a', '2026-11', 120_00, 135_00)]
    expect(growthInMonth(v, '2026-11')).toBe(135_00 - 110_00 - 20_00)
  })

  it('is null without both months', () => {
    expect(growthInMonth([val('a', '2026-11', 1, 1)], '2026-11')).toBeNull()
  })
})

describe('lastDayOf', () => {
  it('knows month lengths', () => {
    expect(lastDayOf('2026-02')).toBe('2026-02-28')
    expect(lastDayOf('2028-02')).toBe('2028-02-29')
    expect(lastDayOf('2026-11')).toBe('2026-11-30')
  })
})

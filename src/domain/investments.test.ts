import { describe, expect, it } from 'vitest'
import { makeAccount, makeTransfer } from '../test/factories'
import {
  allocation,
  allocationProblem,
  classShareBps,
  contributedThrough,
  groupsFromClassTargets,
  growthInMonth,
  holdingCashFlows,
  holdingRows,
  investedInMonth,
  lastDayOf,
  latestValuations,
  totalRows,
  xirr,
} from './investments'
import type { AllocationGroup, Holding, Valuation } from './types'

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

const group = (id: string, target: number, order: number, extra: Partial<AllocationGroup> = {}) =>
  ({ id, name: id, target, order, createdAt: STAMP, updatedAt: STAMP, ...extra }) as AllocationGroup

describe('allocation', () => {
  it('compares each group with its target and flags big gaps', () => {
    const rows = holdingRows(
      [
        holding('nifty', 'equity', { groupId: 'india' }),
        holding('sp500', 'equity', { groupId: 'us' }),
        holding('sgb', 'gold', { groupId: 'gold' }),
        holding('etf', 'gold', { groupId: 'gold' }),
      ],
      [
        val('nifty', '2026-11', 0, 60_000_00),
        val('sp500', '2026-11', 0, 21_000_00),
        val('sgb', '2026-11', 0, 10_000_00),
        val('etf', '2026-11', 0, 9_000_00),
      ],
    )
    const groups = [group('us', 2500, 1), group('india', 5500, 0), group('gold', 2000, 2)]
    const { rows: mix, total } = allocation(rows, groups)
    expect(total).toBe(100_000_00)
    expect(mix.map((r) => r.group?.id)).toEqual(['india', 'us', 'gold'])
    expect(mix[0]).toMatchObject({ actualBps: 6000, gapBps: 500, status: 'over' })
    expect(mix[1]).toMatchObject({ actualBps: 2100, gapBps: -400, status: 'under' })
    expect(mix[2]).toMatchObject({ value: 19_000_00, actualBps: 1900, status: 'on' })
  })

  it('flags small targets sooner, and any money in a 0% group', () => {
    const rows = holdingRows(
      [
        holding('main', 'equity', { groupId: 'main' }),
        holding('silver', 'other', { groupId: 'silver' }),
        holding('old', 'other', { groupId: 'zero' }),
      ],
      [
        val('main', '2026-11', 0, 9_849_00),
        val('silver', '2026-11', 0, 150_00),
        val('old', '2026-11', 0, 1_00),
      ],
    )
    const groups = [group('main', 9800, 0), group('silver', 200, 1), group('zero', 0, 2)]
    const [main, silver, zero] = allocation(rows, groups).rows
    expect(main).toMatchObject({ gapBps: 49, status: 'on' })
    expect(silver).toMatchObject({ actualBps: 150, gapBps: -50, status: 'under' })
    expect(zero).toMatchObject({ actualBps: 1, status: 'over' })
  })

  it('collects holdings with no group, or a deleted one, in a No group row', () => {
    const rows = holdingRows(
      [
        holding('a', 'equity', { groupId: 'kept' }),
        holding('b', 'equity'),
        holding('c', 'equity', { groupId: 'gone' }),
        holding('old', 'equity', { archived: true }),
      ],
      [
        val('a', '2026-11', 0, 50_00),
        val('b', '2026-11', 0, 30_00),
        val('c', '2026-11', 0, 20_00),
        val('old', '2026-11', 0, 999_00),
      ],
    )
    const groups = [group('kept', 10000, 0), group('gone', 0, 1, { deletedAt: STAMP })]
    const { rows: mix, total } = allocation(rows, groups)
    expect(total).toBe(100_00)
    expect(mix).toHaveLength(2)
    expect(mix[1]).toMatchObject({ group: null, value: 50_00, actualBps: 5000, targetBps: null })
    expect(mix[1]!.status).toBeNull()
  })

  it('leaves emergency money out of the mix', () => {
    const rows = holdingRows(
      [holding('a', 'equity', { groupId: 'g' }), holding('liquid', 'debt', { emergency: true })],
      [val('a', '2026-11', 0, 100_00), val('liquid', '2026-11', 0, 900_00)],
    )
    const { rows: mix, total } = allocation(rows, [group('g', 10000, 0)])
    expect(total).toBe(100_00)
    expect(mix).toHaveLength(1)
    expect(mix[0]).toMatchObject({ actualBps: 10000, status: 'on' })
  })

  it('has no percentages when there is nothing', () => {
    const { rows } = allocation([], [group('a', 10000, 0)])
    expect(rows.every((r) => r.actualBps === null && r.status === null)).toBe(true)
  })

  it('needs named, distinct groups whose targets add up to 100%', () => {
    expect(allocationProblem([])).toBeNull()
    expect(allocationProblem([{ name: 'Gold', target: 10000 }])).toBeNull()
    expect(allocationProblem([{ name: ' ', target: 10000 }])).toMatch(/name/)
    expect(
      allocationProblem([
        { name: 'Gold', target: 5000 },
        { name: 'gold ', target: 5000 },
      ]),
    ).toMatch(/two groups/)
    expect(allocationProblem([{ name: 'Gold', target: 9000 }])).toMatch(/100%/)
  })
})

describe('classShareBps', () => {
  it('counts savings as cash and ignores archived holdings', () => {
    const rows = holdingRows(
      [holding('a', 'equity'), holding('old', 'equity', { archived: true })],
      [val('a', '2026-11', 0, 90_00), val('old', '2026-11', 0, 999_00)],
    )
    expect(classShareBps(rows, 10_00, 'equity')).toBe(9000)
    expect(classShareBps(rows, 10_00, 'cash')).toBe(1000)
    expect(classShareBps([], 0, 'equity')).toBeNull()
  })
})

describe('groupsFromClassTargets', () => {
  it('makes a group per class with a target or a holding', () => {
    const groups = groupsFromClassTargets(
      { equity: 7000, debt: 3000, gold: 0, cash: 0 },
      [holding('btc', 'crypto'), holding('gone', 'other', { deletedAt: STAMP })],
      STAMP,
    )
    expect(groups.map((g) => [g.id, g.name, g.target, g.order])).toEqual([
      ['ag-equity', 'Equity', 7000, 0],
      ['ag-debt', 'Debt', 3000, 1],
      ['ag-crypto', 'Crypto', 0, 2],
    ])
  })

  it('uses the old defaults when targets were never saved, and makes nothing for an empty app', () => {
    const groups = groupsFromClassTargets(undefined, [holding('a', 'equity')], STAMP)
    expect(groups.map((g) => g.target)).toEqual([6000, 2500, 1000, 500])
    expect(groupsFromClassTargets(undefined, [], STAMP)).toEqual([])
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

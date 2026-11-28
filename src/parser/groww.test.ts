import { describe, expect, it } from 'vitest'
import { findAsOf, parseGrowwHoldings } from './groww'

// Shaped like Groww's downloads (personal details made up). Numbers arrive as numbers or
// as text, as they do in the real files.
const MUTUAL_FUNDS = [
  ['Personal Details', ''],
  ['Name', 'A Person'],
  ['PAN', 'ABCDE1234F'],
  ['HOLDING SUMMARY', ''],
  ['Total Investments', 'Current Portfolio Value', 'Profit/Loss', 'Profit/Loss %', 'XIRR'],
  ['40000', '42000.75', '2000.75', '5%', '12%'],
  ['HOLDINGS AS ON 2026-11-28'],
  [
    'Scheme Name',
    'AMC',
    'Category',
    'Sub-category',
    'Folio No.',
    'Source',
    'Units',
    'Invested Value',
    'Current Value',
    'Returns',
    'XIRR',
  ],
  [
    'Parag Parikh Flexi Cap Fund Direct Growth',
    'PPFAS Mutual Fund',
    'Equity',
    'Flexi Cap',
    '11111111',
    'Groww',
    100.5,
    '10000.00',
    '11000.50',
    1000.5,
    '10%',
  ],
  [
    'Axis Liquid Direct Fund Growth',
    'Axis Mutual Fund',
    'Debt',
    'Liquid',
    '900000000001',
    'Groww',
    10,
    '30000',
    '31000.25',
    1000.25,
    '6%',
  ],
]

const STOCKS = [
  ['Name', 'A Person'],
  ['Unique Client Code', '1234567890'],
  ['Holdings statement for stocks as on 27-11-2026'],
  ['Summary'],
  ['Invested Value', 5400],
  ['Closing Value', 4941],
  [
    'Stock Name',
    'ISIN',
    'Quantity',
    'Average buy price',
    'Buy value',
    'Closing price',
    'Closing value',
    'Unrealised P&L',
  ],
  ['HINDUSTAN COPPER LTD', 'INE531E01026', 10, 500, 5000, 450, 4500, -500],
  ['ICICI PRUDENTIAL GOLD ETF', 'INF109KC1NT3', 4, 100, 400, 110.25, 441.00000000000006, 41],
]

describe('Groww holdings reports', () => {
  it('reads the mutual funds report', () => {
    const result = parseGrowwHoldings(MUTUAL_FUNDS)
    if (!result.ok) throw new Error(result.message)
    const { report, asOf, rows, totalMismatch } = result.holdings
    expect(report).toBe('mutual_funds')
    expect(asOf).toBe('2026-11-28')
    expect(totalMismatch).toBeUndefined()
    expect(rows[0]).toEqual({
      name: 'Parag Parikh Flexi Cap Fund Direct Growth',
      folio: '11111111',
      units: 100.5,
      invested: 10000_00,
      value: 11000_50,
      kind: 'mutual_fund',
      assetClass: 'equity',
    })
    expect(rows[1]).toMatchObject({ folio: '900000000001', assetClass: 'debt' })
  })

  it('reads the stocks report, telling shares from ETFs', () => {
    const result = parseGrowwHoldings(STOCKS)
    if (!result.ok) throw new Error(result.message)
    const { report, asOf, rows, totalMismatch } = result.holdings
    expect(report).toBe('stocks')
    expect(asOf).toBe('2026-11-27')
    expect(totalMismatch).toBeUndefined()
    expect(rows[0]).toEqual({
      name: 'HINDUSTAN COPPER LTD',
      isin: 'INE531E01026',
      units: 10,
      invested: 5000_00,
      value: 4500_00,
      kind: 'stock',
      assetClass: 'equity',
    })
    expect(rows[1]).toMatchObject({ kind: 'etf', assetClass: 'gold', value: 441_00 })
    expect(rows.every((r) => r.problem === undefined)).toBe(true)
  })

  it('flags a row whose quantity × price is not its value', () => {
    const grid = STOCKS.map((r) => [...r])
    grid[7]![6] = 5500
    const result = parseGrowwHoldings(grid)
    if (!result.ok) throw new Error(result.message)
    expect(result.holdings.rows[0]!.problem).toMatch(/doesn’t match/)
    // The rows no longer add up to the printed total either.
    expect(result.holdings.totalMismatch).toEqual({ printed: 4941_00, rows: 5941_00 })
  })

  it('notices when a row is missing against the printed total', () => {
    const result = parseGrowwHoldings(MUTUAL_FUNDS.slice(0, -1))
    if (!result.ok) throw new Error(result.message)
    expect(result.holdings.totalMismatch).toEqual({ printed: 42000_75, rows: 11000_50 })
  })

  it('turns away other files', () => {
    expect(parseGrowwHoldings([['Date', 'Narration', 'Withdrawal']])).toMatchObject({ ok: false })
    expect(
      parseGrowwHoldings(MUTUAL_FUNDS.filter((r) => !String(r[0]).startsWith('HOLDINGS AS'))),
    ).toMatchObject({
      ok: false,
      message: expect.stringMatching(/as on/),
    })
  })

  it('finds the date in either format', () => {
    expect(findAsOf([['Holdings as on 2026-01-05']])).toBe('2026-01-05')
    expect(findAsOf([['x'], ['statement as on 05/01/2026']])).toBe('2026-01-05')
    expect(findAsOf([['no date']])).toBeNull()
  })
})

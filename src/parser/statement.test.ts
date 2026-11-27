import { describe, expect, it } from 'vitest'
import {
  detectBank,
  parseAmountPaise,
  parseCsv,
  parseStatementDate,
  parseStatementGrid,
} from './statement'

const hdfcGrid = [
  ['HDFC BANK Ltd.', '', '', '', '', '', 'Statement of accounts'],
  ['Account No :50100837716135'],
  [
    'Date',
    'Narration',
    'Chq./Ref.No.',
    'Value Dt',
    'Withdrawal Amt.',
    'Deposit Amt.',
    'Closing Balance',
  ],
  ['********', '*****', '*****', '*****', '*****', '*****', '*****'],
  [
    '01/11/26',
    'UPI-SWIGGY INSTAMART PRI-X@AXB-UTIB0000100-132163094242-UPI',
    '0000132163094242',
    '01/11/26',
    560,
    '',
    24636.92,
  ],
  [
    '02/11/26',
    'UPI-SIDDHARTH AASAL SO P-X@OKICICI-PUNB0122000-630661982440-UPI',
    '0000630661982440',
    '02/11/26',
    '',
    856,
    25000.56,
  ],
  ['Generated On:', '27-Nov-2026 11:49'],
]

const pnbGrid = [
  ['Account Statement For Account:1220000100300315'],
  ['IFSC Code:', 'PUNB0122000'],
  [
    '',
    'Transaction Date',
    '',
    'Cheque Number',
    '',
    'Withdrawal',
    '',
    'Deposit',
    'Balance',
    'Narration',
  ],
  [
    '',
    '25/11/2026',
    '',
    '',
    '',
    '20.00',
    '',
    '',
    '20,632.01 Cr.',
    'UPI/DR/632972033649/SHALINI/YESB/bharatpe9s0h7z3/P',
  ],
  [
    '',
    '21/11/2026',
    '',
    '',
    '',
    '',
    '',
    '1.00',
    '46,055.01 Cr.',
    'IMPS-IN/632628000021/911234567890/APIBANKI',
  ],
]

describe('parseStatementDate', () => {
  it('reads the common bank date formats', () => {
    expect(parseStatementDate('01/11/26')).toBe('2026-11-01')
    expect(parseStatementDate('25/11/2026')).toBe('2026-11-25')
    expect(parseStatementDate('5-Nov-2026')).toBe('2026-11-05')
    expect(parseStatementDate('05.11.2026')).toBe('2026-11-05')
  })

  it('rejects impossible and non-dates', () => {
    expect(parseStatementDate('31/02/2026')).toBeNull()
    expect(parseStatementDate('Generated On:')).toBeNull()
    expect(parseStatementDate('')).toBeNull()
    expect(parseStatementDate(null)).toBeNull()
  })
})

describe('parseAmountPaise', () => {
  it('handles numbers, Indian grouping and blanks', () => {
    expect(parseAmountPaise(560)).toBe(56_000)
    expect(parseAmountPaise('1,29,826.85')).toBe(12_982_685)
    expect(parseAmountPaise('₹ 20.00')).toBe(2_000)
    expect(parseAmountPaise(24636.92)).toBe(2_463_692)
    expect(parseAmountPaise('')).toBe(0)
    expect(parseAmountPaise('abc')).toBe(0)
  })
})

describe('parseStatementGrid', () => {
  it('reads an HDFC-style statement by its header', () => {
    const r = parseStatementGrid(hdfcGrid)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.statement.bank).toBe('hdfc')
    expect(r.statement.rows).toHaveLength(2)
    expect(r.statement.rows[0]).toMatchObject({
      date: '2026-11-01',
      amount: 56_000,
      direction: 'out',
    })
    expect(r.statement.rows[1]).toMatchObject({ amount: 85_600, direction: 'in' })
    expect([r.statement.from, r.statement.to]).toEqual(['2026-11-01', '2026-11-02'])
  })

  it('reads a PNB-style statement whose cells are spread across merged columns', () => {
    const r = parseStatementGrid(pnbGrid)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.statement.bank).toBe('pnb')
    expect(r.statement.rows.map((x) => [x.direction, x.amount])).toEqual([
      ['out', 2_000],
      ['in', 100],
    ])
  })

  it('gives identical rows distinct, stable keys', () => {
    const row = ['03/11/26', 'UPI-SWIGGY-X-1-UPI', '', '', 166, '', 100]
    const grid = [hdfcGrid[2]!, row, row]
    const a = parseStatementGrid(grid)
    const b = parseStatementGrid(grid)
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    const keys = a.statement.rows.map((r) => r.key)
    expect(new Set(keys).size).toBe(2)
    expect(keys).toEqual(b.statement.rows.map((r) => r.key))
  })

  it('explains what is wrong with an unreadable file', () => {
    const r = parseStatementGrid([['hello'], ['world']])
    expect(r).toMatchObject({ ok: false })
  })
})

describe('parseCsv', () => {
  it('handles quotes, commas inside quotes and CRLF', () => {
    expect(parseCsv('a,"b,c",d\r\n"x ""y""",,z\r\n')).toEqual([
      ['a', 'b,c', 'd'],
      ['x "y"', '', 'z'],
    ])
  })

  it('feeds the grid parser like a spreadsheet would', () => {
    const csv = [
      'Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance',
      '01/11/26,"UPI-SWIGGY-X-1-UPI",560.00,,24636.92',
    ].join('\n')
    const r = parseStatementGrid(parseCsv(csv))
    expect(r.ok && r.statement.rows[0]).toMatchObject({ amount: 56_000, direction: 'out' })
  })
})

describe('detectBank', () => {
  it('falls back to unknown', () => {
    expect(detectBank([['Some other bank']])).toBe('unknown')
  })
})

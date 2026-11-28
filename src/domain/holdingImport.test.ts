import { describe, expect, it } from 'vitest'
import type { ImportedHolding } from '../parser/groww'
import { matchHoldings, missingFromReport, nameSimilarity } from './holdingImport'
import type { Holding } from './types'

const STAMP = '2026-11-01T00:00:00.000Z'
const holding = (id: string, name: string, extra: Partial<Holding> = {}): Holding => ({
  id,
  name,
  kind: 'mutual_fund',
  assetClass: 'equity',
  archived: false,
  createdAt: STAMP,
  updatedAt: STAMP,
  ...extra,
})
const row = (name: string, extra: Partial<ImportedHolding> = {}): ImportedHolding => ({
  name,
  units: 1,
  invested: 100,
  value: 110,
  kind: 'mutual_fund',
  assetClass: 'equity',
  ...extra,
})

describe('nameSimilarity', () => {
  it('ignores the words every fund name has', () => {
    expect(nameSimilarity('UTI Nifty 50', 'UTI Nifty 50 Index Fund Direct Growth')).toBe(1)
    expect(nameSimilarity('Nifty 50', 'Nippon India Small Cap Fund Direct Growth')).toBe(0)
    // One shared word is not enough to call two names the same.
    expect(nameSimilarity('Axis Bluechip', 'Axis Liquid Direct Fund Growth')).toBe(0)
  })
})

describe('matchHoldings', () => {
  it('finds linked holdings by ISIN or folio, and suggests by name the first time', () => {
    const holdings = [
      holding('copper', 'Copper shares', { isin: 'INE531E01026', kind: 'stock' }),
      holding('ppfas', 'Flexi cap', { folio: '11111111' }),
      holding('uti', 'UTI Nifty 50'),
      holding('old', 'UTI Nifty 50 old', { archived: true }),
    ]
    const matches = matchHoldings(
      [
        row('HINDUSTAN COPPER LTD', { isin: 'INE531E01026' }),
        row('Parag Parikh Flexi Cap Fund Direct Growth', { folio: '11111111' }),
        row('UTI Nifty 50 Index Fund Direct Growth', { folio: '500000000002' }),
        row('Axis Liquid Direct Fund Growth', { folio: '900000000001' }),
      ],
      holdings,
    )
    expect(matches.map((m) => m && [m.holding.id, m.by])).toEqual([
      ['copper', 'id'],
      ['ppfas', 'id'],
      ['uti', 'name'],
      null,
    ])
  })

  it('tells schemes in one folio apart by name', () => {
    const holdings = [
      holding('mid', 'Motilal Oswal Midcap', { folio: '9101' }),
      holding('flexi', 'Motilal Oswal Flexi Cap', { folio: '9101' }),
    ]
    const matches = matchHoldings(
      [
        row('Motilal Oswal Flexi Cap Fund Direct Growth', { folio: '9101' }),
        row('Motilal Oswal Midcap Fund Direct Growth', { folio: '9101' }),
      ],
      holdings,
    )
    expect(matches.map((m) => m?.holding.id)).toEqual(['flexi', 'mid'])
  })

  it('never gives one holding to two rows', () => {
    const matches = matchHoldings(
      [row('UTI Nifty 50 Index Fund'), row('UTI Nifty 50 Index Fund Direct')],
      [holding('uti', 'UTI Nifty 50')],
    )
    expect(matches.map((m) => m?.holding.id ?? null)).toEqual(['uti', null])
  })
})

describe('missingFromReport', () => {
  it('lists linked holdings the report no longer has', () => {
    const holdings = [
      holding('a', 'A', { isin: 'INE000000001' }),
      holding('b', 'B', { isin: 'INE000000002' }),
      holding('c', 'C', { isin: 'INE000000003', archived: true }),
      holding('f', 'F', { folio: '1' }),
    ]
    const rows = [row('A', { isin: 'INE000000001' })]
    expect(missingFromReport(rows, holdings, 'stocks').map((h) => h.id)).toEqual(['b'])
    expect(missingFromReport([], holdings, 'mutual_funds').map((h) => h.id)).toEqual(['f'])
  })
})

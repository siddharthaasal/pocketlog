import type { ImportedHolding } from '../parser/groww'
import type { Holding } from './types'

/** Words every fund name has, which say nothing about which fund it is. */
const FILLER = new Set(
  'fund direct growth plan option opt regular the of and ltd limited mutual mf amc india idcw dividend reinvestment payout'.split(
    ' ',
  ),
)

/** "UTI Nifty 50 Index Fund Direct Growth" → {uti, nifty, 50, index}. */
export function nameWords(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w && !FILLER.has(w)),
  )
}

/** Share of the shorter name's words found in the other: 1 when one name contains the other. */
export function nameSimilarity(a: string, b: string): number {
  const x = nameWords(a)
  const y = nameWords(b)
  const [small, large] = x.size <= y.size ? [x, y] : [y, x]
  if (small.size === 0) return 0
  let shared = 0
  for (const w of small) if (large.has(w)) shared++
  return shared < 2 && small.size > 1 ? 0 : shared / small.size
}

export interface HoldingMatch {
  holding: Holding
  /** 'id' when a previous import linked them (ISIN or folio); 'name' when only the names agree. */
  by: 'id' | 'name'
}

/**
 * Finds the holding each imported row belongs to. A holding linked by ISIN or folio always
 * wins; otherwise the closest name among holdings not yet linked to anything is suggested.
 * Each holding is matched at most once.
 */
export function matchHoldings(
  rows: readonly ImportedHolding[],
  holdings: readonly Holding[],
): (HoldingMatch | null)[] {
  const alive = holdings.filter((h) => !h.deletedAt)
  const used = new Set<string>()
  const rowsPerFolio = new Map<string, number>()
  for (const r of rows) if (r.folio) rowsPerFolio.set(r.folio, (rowsPerFolio.get(r.folio) ?? 0) + 1)

  const out: (HoldingMatch | null)[] = rows.map((row) => {
    if (row.isin) {
      const h = alive.find((x) => x.isin === row.isin && !used.has(x.id))
      if (!h) return null
      used.add(h.id)
      return { holding: h, by: 'id' }
    }
    if (!row.folio) return null
    // One folio can hold several schemes of the same fund house. The folio alone is enough
    // when it is the only one of its kind on both sides; otherwise the names must agree too.
    const linked = alive.filter((h) => h.folio === row.folio && !used.has(h.id))
    const alone = linked.length === 1 && rowsPerFolio.get(row.folio) === 1
    const scored = linked
      .map((h) => ({ h, s: nameSimilarity(h.name, row.name) }))
      .filter((x) => alone || x.s >= 0.5)
      .sort((a, b) => b.s - a.s)
    const h = scored[0]?.h
    if (!h) return null
    used.add(h.id)
    return { holding: h, by: 'id' }
  })

  return out.map((match, i) => {
    if (match) return match
    const row = rows[i]!
    let best: Holding | undefined
    let score = 0.75
    for (const h of alive) {
      if (used.has(h.id) || h.archived || h.isin || h.folio) continue
      const s = nameSimilarity(h.name, row.name)
      if (s >= score) {
        best = h
        score = s
      }
    }
    if (!best) return null
    used.add(best.id)
    return { holding: best, by: 'name' }
  })
}

/**
 * Holdings an earlier import linked to this kind of report that this one no longer lists:
 * probably sold, so they are worth archiving.
 */
export function missingFromReport(
  rows: readonly ImportedHolding[],
  holdings: readonly Holding[],
  report: 'mutual_funds' | 'stocks',
): Holding[] {
  const isins = new Set(rows.map((r) => r.isin))
  const folios = new Set(rows.map((r) => r.folio))
  return holdings.filter((h) => {
    if (h.deletedAt || h.archived) return false
    if (report === 'stocks') return h.isin !== undefined && !isins.has(h.isin)
    return h.folio !== undefined && !folios.has(h.folio)
  })
}

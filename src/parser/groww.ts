import type { AssetClass, HoldingKind } from '../domain/types'

/*
 * Groww's holdings reports, as downloaded from the website: one for mutual funds, one for
 * shares and ETFs. Each starts with personal details and a summary, then a table. The table
 * is found by its column names, so extra rows above it don't matter.
 */

type Cell = string | number | null | undefined

export type GrowwReport = 'mutual_funds' | 'stocks'

export interface ImportedHolding {
  /** Shares and ETFs. */
  isin?: string
  /** Mutual funds. */
  folio?: string
  name: string
  units: number
  /** Paise. */
  invested: number
  /** Paise. */
  value: number
  /** Guesses for a new holding; they can be changed later. */
  kind: HoldingKind
  assetClass: AssetClass
  /** Why this row looks wrong; such rows aren't saved unless you choose to. */
  problem?: string
}

export interface ParsedHoldings {
  report: GrowwReport
  /** 'YYYY-MM-DD', from the report's "as on" line. */
  asOf: string
  rows: ImportedHolding[]
  /** Set when the rows don't add up to the total the report printed, e.g. a row went missing. */
  totalMismatch?: { printed: number; rows: number }
}

export type GrowwResult = { ok: true; holdings: ParsedHoldings } | { ok: false; message: string }

const text = (cell: Cell) => (cell == null ? '' : String(cell).trim())
const norm = (cell: Cell) => text(cell).toLowerCase().replace(/\s+/g, ' ')

/** 1234.5, "1234.50", "1,234.50" or "₹ 99" as a number; null when it isn't one. */
function num(cell: Cell): number | null {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null
  const cleaned = text(cell).replace(/[₹,\s]/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  return Number(cleaned)
}

const toPaise = (rupees: number) => Math.round(rupees * 100)

/** "as on 2026-11-28" or "as on 27-11-2026", anywhere in the sheet. */
export function findAsOf(grid: readonly (readonly Cell[])[]): string | null {
  for (const row of grid) {
    for (const cell of row) {
      const m = /as on\s+(\d{4})-(\d{2})-(\d{2})|as on\s+(\d{2})[-/](\d{2})[-/](\d{4})/i.exec(
        text(cell),
      )
      if (m) return m[1] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[6]}-${m[5]}-${m[4]}`
    }
  }
  return null
}

/** A total the report printed: in the cell to the right of its label, or the one below it. */
function printedTotal(grid: readonly (readonly Cell[])[], label: string): number | null {
  for (const [r, row] of grid.entries()) {
    const c = row.findIndex((cell) => norm(cell) === label)
    if (c < 0) continue
    const right = num(row[c + 1])
    if (right !== null) return right
    const below = num(grid[r + 1]?.[c])
    if (below !== null) return below
  }
  return null
}

const COLUMNS = {
  mutual_funds: {
    name: 'scheme name',
    folio: 'folio no.',
    category: 'category',
    subCategory: 'sub-category',
    units: 'units',
    invested: 'invested value',
    value: 'current value',
  },
  stocks: {
    name: 'stock name',
    isin: 'isin',
    units: 'quantity',
    invested: 'buy value',
    price: 'closing price',
    value: 'closing value',
  },
} as const

const TOTAL_LABELS: Record<GrowwReport, string> = {
  mutual_funds: 'current portfolio value',
  stocks: 'closing value',
}

function findHeader(grid: readonly (readonly Cell[])[]) {
  for (const [index, row] of grid.entries()) {
    const names = row.map(norm)
    for (const report of ['mutual_funds', 'stocks'] as const) {
      const wanted = Object.values(COLUMNS[report])
      if (wanted.every((w) => names.includes(w))) {
        const col = Object.fromEntries(
          Object.entries(COLUMNS[report]).map(([key, w]) => [key, names.indexOf(w)]),
        ) as Record<string, number>
        return { report, index, col }
      }
    }
  }
  return null
}

function fundClass(category: string, subCategory: string): AssetClass {
  const both = `${category} ${subCategory}`.toLowerCase()
  if (/gold|silver|commodit/.test(both)) return /gold/.test(both) ? 'gold' : 'other'
  if (/debt|liquid|money market|gilt|bond/.test(both)) return 'debt'
  if (/equity|index|elss|hybrid/.test(both)) return 'equity'
  return 'other'
}

function demat(name: string, isin: string): Pick<ImportedHolding, 'kind' | 'assetClass'> {
  // INE… is a company's share; INF… is a fund unit held in demat, i.e. an ETF.
  const etf = isin.startsWith('INF') || /\b(etf|bees)\b/i.test(name)
  if (!etf) return { kind: 'stock', assetClass: 'equity' }
  if (/gold/i.test(name)) return { kind: 'etf', assetClass: 'gold' }
  if (/silver/i.test(name)) return { kind: 'etf', assetClass: 'other' }
  if (/liquid|gilt|bond/i.test(name)) return { kind: 'etf', assetClass: 'debt' }
  return { kind: 'etf', assetClass: 'equity' }
}

export function parseGrowwHoldings(grid: readonly (readonly Cell[])[]): GrowwResult {
  const header = findHeader(grid)
  if (!header) {
    return {
      ok: false,
      message:
        'This isn’t a Groww holdings report. Use the mutual funds or the stocks holdings report, as downloaded.',
    }
  }
  const asOf = findAsOf(grid)
  if (!asOf) return { ok: false, message: 'Couldn’t find the “as on” date in this report.' }

  const { report, col } = header
  const rows: ImportedHolding[] = []
  for (const row of grid.slice(header.index + 1)) {
    const name = text(row[col.name!])
    const units = num(row[col.units!])
    const invested = num(row[col.invested!])
    const value = num(row[col.value!])
    if (!name || units === null || invested === null || value === null) continue

    const base = {
      name,
      units: Math.round(units * 1000) / 1000,
      invested: toPaise(invested),
      value: toPaise(value),
    }
    if (report === 'mutual_funds') {
      const folio = text(row[col.folio!])
      rows.push({
        ...base,
        ...(folio && { folio }),
        kind: 'mutual_fund',
        assetClass: fundClass(text(row[col.category!]), text(row[col.subCategory!])),
      })
    } else {
      const isin = text(row[col.isin!]).toUpperCase()
      const price = num(row[col.price!])
      const valid = /^IN[A-Z0-9]{10}$/.test(isin)
      // Quantity × closing price should give the closing value; a mismatch means a misread row.
      const off = price !== null && Math.abs(toPaise(units * price) - toPaise(value)) > 100
      rows.push({
        ...base,
        ...(valid && { isin }),
        ...demat(name, isin),
        ...(!valid
          ? { problem: 'No valid ISIN' }
          : off
            ? { problem: 'Quantity × price doesn’t match the value' }
            : {}),
      })
    }
  }
  if (rows.length === 0) return { ok: false, message: 'This report has no holdings in it.' }

  const printed = printedTotal(grid, TOTAL_LABELS[report])
  const sum = rows.reduce((s, r) => s + r.value, 0)
  return {
    ok: true,
    holdings: {
      report,
      asOf,
      rows,
      ...(printed !== null &&
        Math.abs(toPaise(printed) - sum) > 100 && {
          totalMismatch: { printed: toPaise(printed), rows: sum },
        }),
    },
  }
}

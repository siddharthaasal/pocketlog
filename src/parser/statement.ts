import type { StatementRow } from '../domain/reconcile'

export type BankId = 'hdfc' | 'pnb' | 'unknown'

export interface ParsedStatement {
  bank: BankId
  rows: StatementRow[]
  /** Date range the rows cover (inclusive), for spotting entries missing from the statement. */
  from: string
  to: string
}

export type StatementResult =
  { ok: true; statement: ParsedStatement } | { ok: false; message: string }

type Cell = string | number | null | undefined

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const text = (cell: Cell): string => (cell == null ? '' : String(cell).trim())

/** Splits CSV text into rows, honouring quotes and quoted line breaks. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') pushField()
    else if (c === '\n') pushRow()
    else if (c !== '\r') field += c
  }
  if (field !== '' || row.length > 0) pushRow()
  return rows
}

/** `dd/mm/yy`, `dd/mm/yyyy`, `dd-mm-yyyy`, `dd-Mon-yyyy` (and `.`/space separators). */
export function parseStatementDate(value: Cell): string | null {
  const m = /^(\d{1,2})[/\-. ]([A-Za-z]{3}|\d{1,2})[/\-. ](\d{2}|\d{4})$/.exec(text(value))
  if (!m) return null
  const day = Number(m[1])
  const month = /^\d+$/.test(m[2]!) ? Number(m[2]) : MONTHS.indexOf(m[2]!.toLowerCase()) + 1
  let year = Number(m[3])
  if (year < 100) year += 2000
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  // Reject 31 Feb and the like instead of letting Date roll them over.
  return new Date(`${iso}T00:00:00Z`).getUTCDate() === day ? iso : null
}

/** Rupees as text or number → integer paise; 0 for blanks and anything unreadable. */
export function parseAmountPaise(value: Cell): number {
  if (value == null || value === '') return 0
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[₹,\s]|Rs\.?/gi, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
}

/** Small, fast, deterministic string hash (cyrb53). Not for security. */
export function hashText(input: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

export function detectBank(grid: readonly (readonly Cell[])[]): BankId {
  const head = grid
    .slice(0, 30)
    .map((r) => r.map(text).join(' '))
    .join(' ')
    .toLowerCase()
  if (head.includes('hdfc bank') || head.includes('hdfc0')) return 'hdfc'
  if (head.includes('punb') || head.includes('punjab national')) return 'pnb'
  return 'unknown'
}

interface Columns {
  date: number
  narration: number
  withdrawal: number
  deposit: number
  balance: number
  ref: number
}

function findHeader(grid: readonly (readonly Cell[])[]): { row: number; cols: Columns } | null {
  for (const [row, cells] of grid.entries()) {
    const names = cells.map((c) => text(c).toLowerCase())
    const find = (test: (n: string) => boolean) => names.findIndex(test)
    const withdrawal = find((n) => n.startsWith('withdrawal') || n === 'debit' || n === 'dr')
    const deposit = find((n) => n.startsWith('deposit') || n === 'credit' || n === 'cr')
    const narration = find((n) => /narration|particulars|description|remarks/.test(n))
    const date = find((n) => /date/.test(n) && !/value/.test(n))
    if (withdrawal >= 0 && deposit >= 0 && narration >= 0 && date >= 0) {
      return {
        row,
        cols: {
          date,
          narration,
          withdrawal,
          deposit,
          balance: find((n) => /balance/.test(n)),
          ref: find((n) => /ref|chq|cheque/.test(n)),
        },
      }
    }
  }
  return null
}

/**
 * Turns a spreadsheet grid (from .xls/.xlsx/.csv) into statement rows. The header row is
 * located by column names, so the HDFC and PNB layouts, and most CSV exports, work without
 * bank-specific code. Rows that aren't transactions (footers, notes) are skipped.
 */
export function parseStatementGrid(grid: readonly (readonly Cell[])[]): StatementResult {
  const header = findHeader(grid)
  if (!header) {
    return {
      ok: false,
      message:
        'Couldn’t find the transaction table. Expected columns like Date, Narration, Withdrawal and Deposit.',
    }
  }
  const { cols } = header
  const rows: StatementRow[] = []
  const seen = new Map<string, number>()

  for (const cells of grid.slice(header.row + 1)) {
    const date = parseStatementDate(cells[cols.date])
    if (!date) continue
    const out = parseAmountPaise(cells[cols.withdrawal])
    const into = parseAmountPaise(cells[cols.deposit])
    if ((out === 0) === (into === 0)) continue // neither, or both: not a plain transaction
    const direction = out > 0 ? 'out' : 'in'
    const amount = out || into
    const narration = text(cells[cols.narration]).replace(/\s+/g, ' ')
    const balance = cols.balance >= 0 ? text(cells[cols.balance]) : ''
    const ref = cols.ref >= 0 ? text(cells[cols.ref]) : ''
    // Identical rows (same day, amount, payee) are told apart by the running balance, or
    // failing that by how many came before.
    const base = [date, direction, amount, narration, ref, balance].join('|')
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    rows.push({
      key: `stmt-${hashText(base)}${n > 1 ? `-${n}` : ''}`,
      date,
      amount,
      direction,
      narration,
    })
  }

  if (rows.length === 0) return { ok: false, message: 'No transactions were found in this file.' }
  const dates = rows.map((r) => r.date).sort()
  return {
    ok: true,
    statement: { bank: detectBank(grid), rows, from: dates[0]!, to: dates[dates.length - 1]! },
  }
}

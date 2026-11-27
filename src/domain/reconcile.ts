import { addDays } from '../lib/dates'
import type { Category, PaymentMethod, Transaction } from './types'

/** One line of a bank statement, already normalised. Amounts are paise. */
export interface StatementRow {
  /** Stable id for this row; stored on the transaction as `bankRef` once it is linked. */
  key: string
  date: string
  amount: number
  /** Money leaving (`out`) or entering (`in`) the statement's account. */
  direction: 'in' | 'out'
  narration: string
}

export interface Matched {
  row: StatementRow
  tx: Transaction
  /** Matched by a remembered `bankRef` rather than by amount and date. */
  viaRef: boolean
}

export interface Conflict {
  row: StatementRow
  tx: Transaction
  /** Statement amount minus PocketLog amount, in paise. */
  difference: number
}

export interface ReconcileResult {
  matched: Matched[]
  conflicts: Conflict[]
  /** On the statement but not in PocketLog. */
  missing: StatementRow[]
  /** In PocketLog during the statement's period but not on the statement. */
  extra: Transaction[]
}

export interface ReconcileOptions {
  /** How many days apart an entry and a bank row may be and still be the same payment. */
  dateWindow?: number
  /**
   * Which remembered link to honour. Bank rows use `bankRef`; swept emails use `emailRef`, so an
   * entry can be confirmed by both without one overwriting the other.
   */
  refField?: 'bankRef' | 'emailRef'
  /**
   * Call an amount mismatch a conflict only when the payee also matches. Bank narrations are
   * cryptic, so a close amount is enough for them; an email names the merchant, and across every
   * account a close amount alone pairs unrelated spends.
   */
  conflictNeedsPayee?: boolean
}

const STOP_WORDS = new Set([
  'upi',
  'pay',
  'payment',
  'paid',
  'imps',
  'neft',
  'rtgs',
  'the',
  'and',
  'for',
  'bank',
  'txn',
  'from',
  'via',
  'ltd',
  'pvt',
  'limited',
  'private',
  'india',
  'services',
  'service',
  'pri',
  'bharatpe',
  'autopay',
  'mandate',
  'order',
])

const words = (s: string): string[] => s.toLowerCase().match(/[a-z]{3,}/g) ?? []

const significant = (s: string): string[] => words(s).filter((w) => !STOP_WORDS.has(w))

/** The side of `accountId`'s ledger a transaction sits on; null if it doesn't touch it. */
export function sideOf(t: Transaction, accountId: string): 'in' | 'out' | null {
  if (t.type === 'expense') return t.accountId === accountId ? 'out' : null
  if (t.type === 'income') return t.accountId === accountId ? 'in' : null
  if (t.accountId === accountId) return 'out'
  return t.toAccountId === accountId ? 'in' : null
}

const dayGap = (a: string, b: string): number =>
  Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000

/** True when an entry's payee/description shares a meaningful word with the bank narration. */
function sharesWord(row: StatementRow, t: Transaction): boolean {
  const theirs = new Set(significant(row.narration))
  return significant(`${t.merchant ?? ''} ${t.description}`).some((w) => theirs.has(w))
}

interface Pair {
  row: StatementRow
  tx: Transaction
  score: number
}

/** Assigns pairs best-first so each row and each entry is used at most once. */
function assign(pairs: Pair[], rows: Set<StatementRow>, txs: Set<Transaction>): Pair[] {
  const taken: Pair[] = []
  for (const pair of pairs.sort((a, b) => b.score - a.score)) {
    if (!rows.has(pair.row) || !txs.has(pair.tx)) continue
    rows.delete(pair.row)
    txs.delete(pair.tx)
    taken.push(pair)
  }
  return taken
}

/**
 * Compares one account's statement rows with the transactions already in PocketLog.
 *
 * Deterministic, in three passes over whatever is still unmatched:
 *  1. rows already linked by `bankRef`;
 *  2. same direction, same amount, dates within the window (closest date wins);
 *  3. same direction and dates within the window, but a different amount, when the amount is
 *     close (within ₹1 or 5%) or the payee shares a word: reported as a conflict.
 * Whatever is left is `missing` (statement only) or `extra` (PocketLog only).
 *
 * With `accountId` null, rows are matched against expenses on any account. Swept emails use
 * this: a receipt doesn't say which account paid.
 */
export function reconcile(
  rows: readonly StatementRow[],
  transactions: readonly Transaction[],
  accountId: string | null,
  { dateWindow = 2, refField = 'bankRef', conflictNeedsPayee = false }: ReconcileOptions = {},
): ReconcileResult {
  const result: ReconcileResult = { matched: [], conflicts: [], missing: [], extra: [] }
  if (rows.length === 0) return result

  const dates = rows.map((r) => r.date).sort()
  const first = dates[0]!
  const last = dates[dates.length - 1]!
  const from = addDays(first, -dateWindow)
  const to = addDays(last, dateWindow)

  const side = (t: Transaction) =>
    accountId === null ? (t.type === 'expense' ? 'out' : null) : sideOf(t, accountId)
  const liveRows = new Set(rows)
  const candidates = new Set(
    transactions.filter((t) => !t.deletedAt && t.date >= from && t.date <= to && side(t) !== null),
  )

  // 1. Remembered links.
  const byRef = new Map<string, Transaction>()
  for (const t of candidates) if (t[refField]) byRef.set(t[refField]!, t)
  for (const row of rows) {
    const tx = byRef.get(row.key)
    if (tx && candidates.has(tx)) {
      result.matched.push({ row, tx, viaRef: true })
      liveRows.delete(row)
      candidates.delete(tx)
    }
  }

  // 2. Same direction, amount and (nearly) date.
  const exact: Pair[] = []
  for (const row of liveRows) {
    for (const tx of candidates) {
      if (side(tx) !== row.direction || tx.amount !== row.amount) continue
      const gap = dayGap(row.date, tx.date)
      if (gap > dateWindow) continue
      exact.push({ row, tx, score: 100 - gap * 10 + (sharesWord(row, tx) ? 5 : 0) })
    }
  }
  for (const { row, tx } of assign(exact, liveRows, candidates)) {
    result.matched.push({ row, tx, viaRef: false })
  }

  // 3. Probably the same payment, but the amounts disagree.
  const near: Pair[] = []
  for (const row of liveRows) {
    for (const tx of candidates) {
      if (side(tx) !== row.direction) continue
      const gap = dayGap(row.date, tx.date)
      if (gap > dateWindow) continue
      const diff = Math.abs(row.amount - tx.amount)
      const close = diff <= Math.max(100, Math.max(row.amount, tx.amount) * 0.05)
      const sameWord = sharesWord(row, tx)
      if (!close && !sameWord) continue
      if (conflictNeedsPayee && !sameWord) continue
      near.push({ row, tx, score: (close ? 50 : 0) + (sameWord ? 30 : 0) - gap * 5 - diff / 1e6 })
    }
  }
  for (const { row, tx } of assign(near, liveRows, candidates)) {
    result.conflicts.push({ row, tx, difference: row.amount - tx.amount })
  }

  result.missing = rows.filter((r) => liveRows.has(r))
  // Entries only count as "not on the statement" inside the period it covers, and not when
  // they already came from some bank statement (their row may simply be in another file).
  result.extra = [...candidates].filter((t) => t.date >= first && t.date <= last && !t[refField])
  return result
}

// ---------- Own-account transfers ----------

export interface Located<R> {
  accountId: string
  row: R
}

export interface TransferPair {
  out: Located<StatementRow>
  into: Located<StatementRow>
}

/**
 * Pairs a debit on one account with an equal credit on another, within the date window:
 * moving your own money between accounts. Closest dates are paired first.
 */
export function pairTransfers(
  missing: readonly Located<StatementRow>[],
  dateWindow = 2,
): { pairs: TransferPair[]; rest: Located<StatementRow>[] } {
  const outs = missing.filter((m) => m.row.direction === 'out')
  const ins = missing.filter((m) => m.row.direction === 'in')
  const candidates: { out: Located<StatementRow>; into: Located<StatementRow>; gap: number }[] = []
  for (const out of outs) {
    for (const into of ins) {
      if (out.accountId === into.accountId || out.row.amount !== into.row.amount) continue
      const gap = dayGap(out.row.date, into.row.date)
      if (gap <= dateWindow) candidates.push({ out, into, gap })
    }
  }
  candidates.sort((a, b) => a.gap - b.gap)
  const used = new Set<Located<StatementRow>>()
  const pairs: TransferPair[] = []
  for (const { out, into } of candidates) {
    if (used.has(out) || used.has(into)) continue
    used.add(out)
    used.add(into)
    pairs.push({ out, into })
  }
  return { pairs, rest: missing.filter((m) => !used.has(m)) }
}

// ---------- Reading a narration ----------

const titleCase = (s: string): string =>
  s
    .toLowerCase()
    .replace(/(^|[\s.&/-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase())
    .trim()

/** A readable payee from a raw bank narration (UPI, card, IMPS…). */
export function extractPayee(narration: string): string {
  const n = narration.replace(/\s+/g, ' ').trim()
  let name: string | undefined
  // HDFC UPI: UPI-NAME-vpa-ifsc-ref-note, with AUTOPAY- prefixes for mandates.
  const hdfc = /^UPI-(?:AUTOPAY-)?([^-]+)-/i.exec(n)
  if (hdfc) name = hdfc[1]
  // PNB UPI: UPI/DR/ref/NAME/bank/vpa/note
  const pnb = /^UPI\/(?:DR|CR)\/\d+\/([^/]+)/i.exec(n)
  if (!name && pnb) name = pnb[1]
  // Card: POS <card> <ref> <date> <time> <CITY ST> MERCHANT
  const pos = /^POS \S+ \d+ \S+ \d\d:\d\d:\d\d (.+)$/i.exec(n)
  if (!name && pos) name = pos[1]!.replace(/^.*?\s{2,}/, '').replace(/^[A-Z ]+ [A-Z]{2} /, '')
  const ecom = /^ECOM \d+ (.+)$/i.exec(n)
  if (!name && ecom) name = ecom[1]
  return titleCase((name ?? n).replace(/[*]+/g, ' ').trim()).slice(0, 60) || 'Bank transaction'
}

const CORPORATE_WORDS = new Set([
  'limited',
  'ltd',
  'pvt',
  'private',
  'india',
  'services',
  'service',
  'pri',
])

/** Groups spellings of the same payee ("Swiggy Limited" / "SWIGGY") under one key. */
export function payeeKey(text: string): string {
  const tokens = (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (t) => !CORPORATE_WORDS.has(t),
  )
  return tokens.slice(0, 2).join(' ')
}

export function paymentMethodFor(narration: string): PaymentMethod {
  if (/^UPI[-/]/i.test(narration)) return 'upi'
  if (/^(POS|ECOM|DC |RFX)/i.test(narration)) return 'card'
  if (/^(IMPS|NEFT|RTGS)/i.test(narration)) return 'netbanking'
  return 'other'
}

// ---------- Suggestions ----------

/**
 * Picks a category for a statement row: first by what you chose for the same payee before
 * (most common choice wins), then by the keywords on your categories.
 */
export function suggestCategory(
  row: StatementRow,
  history: readonly Transaction[],
  categories: readonly Category[],
): { categoryId: string; basis: 'history' | 'keyword' } | null {
  const type = row.direction === 'out' ? 'expense' : 'income'
  const usable = new Map(
    categories.filter((c) => c.type === type && !c.archived && !c.deletedAt).map((c) => [c.id, c]),
  )
  const key = payeeKey(extractPayee(row.narration))
  if (key) {
    const votes = new Map<string, number>()
    for (const t of history) {
      if (t.deletedAt || t.type !== type || !t.categoryId || !usable.has(t.categoryId)) continue
      if (t.needsReview) continue // an unconfirmed guess isn't evidence
      const label = t.merchant || t.description
      if (label && payeeKey(label) === key)
        votes.set(t.categoryId, (votes.get(t.categoryId) ?? 0) + 1)
    }
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]
    if (best) return { categoryId: best[0], basis: 'history' }
  }
  const tokens = new Set(words(row.narration))
  for (const c of usable.values()) {
    if (c.keywords.some((k) => k.split(/\s+/).every((w) => tokens.has(w)))) {
      return { categoryId: c.id, basis: 'keyword' }
    }
  }
  return null
}

// ---------- Ignoring noise ----------

/** ₹1 account-validation credits and similar bank plumbing that was never a real payment. */
const BUILT_IN_NOISE =
  /ACCOUNT ?VALIDATION|ACCOUNT ?VERIFICATION|IMPSTXN|PENNY|IMPS-IN\/\d+\/\d+\/APIBANK|REWARDED FOR PAY/i

export function isNoise(row: StatementRow, ignoredPayees: readonly string[]): boolean {
  if (row.direction === 'in' && row.amount <= 1_000 && BUILT_IN_NOISE.test(row.narration)) {
    return true
  }
  return ignoredPayees.includes(payeeKey(extractPayee(row.narration)))
}

import { monthBounds, shiftMonth } from '../lib/dates'
import {
  ASSET_CLASSES,
  type Account,
  type AssetClass,
  type Holding,
  type Transaction,
  type Valuation,
} from './types'

/** The newest valuation of each holding. */
export function latestValuations(valuations: readonly Valuation[]): Map<string, Valuation> {
  const latest = new Map<string, Valuation>()
  for (const v of valuations) {
    if (v.deletedAt) continue
    const current = latest.get(v.holdingId)
    if (!current || v.month > current.month) latest.set(v.holdingId, v)
  }
  return latest
}

/** A holding's valuation for `month`, or its latest one before it. */
export function valuationAt(
  holdingId: string,
  valuations: readonly Valuation[],
  month: string,
): Valuation | undefined {
  let best: Valuation | undefined
  for (const v of valuations) {
    if (v.deletedAt || v.holdingId !== holdingId || v.month > month) continue
    if (!best || v.month > best.month) best = v
  }
  return best
}

export interface HoldingRow {
  holding: Holding
  invested: number
  value: number
  gain: number
  /** Percent, or null when nothing was invested. */
  gainPct: number | null
  asOf: string | null
}

export function holdingRows(
  holdings: readonly Holding[],
  valuations: readonly Valuation[],
  month?: string,
): HoldingRow[] {
  return holdings
    .filter((h) => !h.deletedAt)
    .map((holding) => {
      const v = month
        ? valuationAt(holding.id, valuations, month)
        : latestValuations(valuations).get(holding.id)
      const invested = v?.invested ?? 0
      const value = v?.value ?? 0
      return {
        holding,
        invested,
        value,
        gain: value - invested,
        gainPct: invested > 0 ? ((value - invested) / invested) * 100 : null,
        asOf: v?.month ?? null,
      }
    })
}

export interface Totals {
  invested: number
  value: number
  gain: number
  gainPct: number | null
}

export function totalRows(rows: readonly HoldingRow[]): Totals {
  const invested = rows.reduce((sum, r) => sum + r.invested, 0)
  const value = rows.reduce((sum, r) => sum + r.value, 0)
  return {
    invested,
    value,
    gain: value - invested,
    gainPct: invested > 0 ? ((value - invested) / invested) * 100 : null,
  }
}

// ---------- Allocation ----------

/** Basis points per asset class; they should add to 10000. */
export type Targets = Record<AssetClass, number>

export const DEFAULT_TARGETS: Targets = {
  equity: 6000,
  debt: 2500,
  gold: 1000,
  cash: 500,
  crypto: 0,
  real_estate: 0,
  other: 0,
}

export interface AllocationRow {
  assetClass: AssetClass
  value: number
  /** Share of the total in basis points, or null when there is nothing to share. */
  actualBps: number | null
  targetBps: number
  /** actual − target, in basis points. */
  gapBps: number | null
  status: 'over' | 'under' | 'on' | null
}

/** A class is flagged once it is this many basis points away from its target. */
export const ALLOCATION_TOLERANCE_BPS = 200

/**
 * Actual mix against targets. `cash` is money in savings accounts, which counts as the Cash class.
 * Property and money lent are left to the caller: only pass what should count as invested.
 */
export function allocation(
  rows: readonly HoldingRow[],
  cash: number,
  targets: Targets,
  tolerance = ALLOCATION_TOLERANCE_BPS,
): { rows: AllocationRow[]; total: number } {
  const byClass = new Map<AssetClass, number>(ASSET_CLASSES.map((c) => [c, 0]))
  for (const r of rows) {
    if (r.holding.archived) continue
    byClass.set(r.holding.assetClass, (byClass.get(r.holding.assetClass) ?? 0) + r.value)
  }
  byClass.set('cash', (byClass.get('cash') ?? 0) + Math.max(0, cash))
  const total = [...byClass.values()].reduce((a, b) => a + b, 0)

  return {
    total,
    rows: ASSET_CLASSES.map((assetClass) => {
      const value = byClass.get(assetClass) ?? 0
      const targetBps = targets[assetClass] ?? 0
      if (total === 0) {
        return { assetClass, value, actualBps: null, targetBps, gapBps: null, status: null }
      }
      const actualBps = Math.round((value / total) * 10000)
      const gapBps = actualBps - targetBps
      const status = gapBps > tolerance ? 'over' : gapBps < -tolerance ? 'under' : 'on'
      return { assetClass, value, actualBps, targetBps, gapBps, status }
    }),
  }
}

export const targetsTotal = (targets: Targets) =>
  ASSET_CLASSES.reduce((sum, c) => sum + (targets[c] ?? 0), 0)

// ---------- Returns ----------

export interface CashFlow {
  date: string
  /** Negative: money you put in. Positive: money you took out, or what it is worth now. */
  amount: number
}

const DAY = 86_400_000
const toDay = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY

/** The real last calendar day of a month, 'YYYY-MM-DD'. */
export function lastDayOf(month: string): string {
  const [y = 0, m = 1] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

/**
 * Annualised return (XIRR) for dated cash flows, as a fraction (0.12 = 12% a year).
 * Null when there is no answer: flows need both an outflow and an inflow, and a span of days.
 */
export function xirr(flows: readonly CashFlow[]): number | null {
  const usable = flows.filter((f) => f.amount !== 0)
  if (!usable.some((f) => f.amount < 0) || !usable.some((f) => f.amount > 0)) return null
  const t0 = Math.min(...usable.map((f) => toDay(f.date)))
  const years = (f: CashFlow) => (toDay(f.date) - t0) / 365
  if (Math.max(...usable.map(years)) === 0) return null
  const npv = (rate: number) =>
    usable.reduce((sum, f) => sum + f.amount / Math.pow(1 + rate, years(f)), 0)

  // NPV falls as the rate rises, so bisection finds the single root reliably.
  let low = -0.999
  let high = 10
  if (npv(low) * npv(high) > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2
    if (npv(low) * npv(mid) <= 0) high = mid
    else low = mid
  }
  return (low + high) / 2
}

/** Which way a tagged transfer moved money, from the holding's point of view. */
export function contributionOf(t: Transaction, accounts: ReadonlyMap<string, Account>): number {
  if (t.deletedAt || t.type !== 'transfer') return 0
  const fromInvestment = accounts.get(t.accountId)?.type === 'investment'
  const toInvestment = t.toAccountId ? accounts.get(t.toAccountId)?.type === 'investment' : false
  // Out of the investment account and not into another: a withdrawal.
  return fromInvestment && !toInvestment ? -t.amount : t.amount
}

/** Dated cash flows for one holding, ending with its current value. */
export function holdingCashFlows(
  holdingId: string,
  transactions: readonly Transaction[],
  accounts: ReadonlyMap<string, Account>,
  latest: Valuation | undefined,
): CashFlow[] {
  const flows: CashFlow[] = []
  for (const t of transactions) {
    if (t.holdingId !== holdingId) continue
    const put = contributionOf(t, accounts)
    if (put !== 0) flows.push({ date: t.date, amount: -put })
  }
  if (latest && latest.value > 0) {
    flows.push({ date: lastDayOf(latest.month), amount: latest.value })
  }
  return flows
}

/** Money tagged to a holding up to the end of `month`, for suggesting the “invested” figure. */
export function contributedThrough(
  holdingId: string,
  transactions: readonly Transaction[],
  accounts: ReadonlyMap<string, Account>,
  month: string,
): number {
  const end = monthBounds(month)[1]
  let total = 0
  for (const t of transactions) {
    if (t.holdingId === holdingId && t.date <= end) total += contributionOf(t, accounts)
  }
  return total
}

/** Money put into holdings during one month (tagged transfers only). */
export function investedInMonth(
  transactions: readonly Transaction[],
  accounts: ReadonlyMap<string, Account>,
  month: string,
): number {
  const [start, end] = monthBounds(month)
  let total = 0
  for (const t of transactions) {
    if (t.holdingId && t.date >= start && t.date <= end) total += contributionOf(t, accounts)
  }
  return total
}

/**
 * Growth in a month: the change in value minus what you put in that month.
 * Null when either month has no valuations to compare.
 */
export function growthInMonth(valuations: readonly Valuation[], month: string): number | null {
  const sum = (m: string) => {
    const rows = valuations.filter((v) => !v.deletedAt && v.month === m)
    return rows.length === 0
      ? null
      : {
          value: rows.reduce((s, v) => s + v.value, 0),
          invested: rows.reduce((s, v) => s + v.invested, 0),
        }
  }
  const now = sum(month)
  const before = sum(shiftMonth(month, -1))
  if (!now || !before) return null
  return now.value - before.value - (now.invested - before.invested)
}

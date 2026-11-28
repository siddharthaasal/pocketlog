import { monthBounds, shiftMonth } from '../lib/dates'
import {
  ASSET_CLASSES,
  ASSET_CLASS_LABELS,
  type Account,
  type AllocationGroup,
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

export interface AllocationRow {
  /** Null for the row that collects holdings in no group. */
  group: AllocationGroup | null
  value: number
  /** Share of the total in basis points, or null when there is nothing to share. */
  actualBps: number | null
  /** Null for the No group row, which has no target. */
  targetBps: number | null
  /** actual − target, in basis points. */
  gapBps: number | null
  status: 'over' | 'under' | 'on' | null
}

/** A group is flagged once it is this many basis points away from its target, at most. */
export const ALLOCATION_TOLERANCE_BPS = 200

/**
 * How far a group may drift before it is flagged: 2 points, or a fifth of its target when that
 * is less, so a 2% target is not "on target" while empty. A 0% group is flagged once it holds anything.
 */
export const allowedGap = (targetBps: number, most = ALLOCATION_TOLERANCE_BPS) =>
  Math.min(most, Math.round(targetBps / 5))

/** Groups that aren't deleted, in table order. */
export function liveGroups(groups: readonly AllocationGroup[]): AllocationGroup[] {
  return groups
    .filter((g) => !g.deletedAt)
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt))
}

/**
 * Actual mix against your groups' targets. Holdings with no group, or whose group was deleted,
 * share one "No group" row (only when they are worth something) and still count in the total.
 * Emergency money isn't part of the mix at all.
 */
export function allocation(
  rows: readonly HoldingRow[],
  groups: readonly AllocationGroup[],
  tolerance = ALLOCATION_TOLERANCE_BPS,
): { rows: AllocationRow[]; total: number } {
  const live = liveGroups(groups)
  const byGroup = new Map<string, number>(live.map((g) => [g.id, 0]))
  let ungrouped = 0
  for (const r of rows) {
    if (r.holding.archived || r.holding.emergency) continue
    const id = r.holding.groupId
    if (id !== undefined && byGroup.has(id)) byGroup.set(id, byGroup.get(id)! + r.value)
    else ungrouped += r.value
  }
  const total = [...byGroup.values()].reduce((a, b) => a + b, ungrouped)
  const share = (value: number) => (total === 0 ? null : Math.round((value / total) * 10000))

  const out: AllocationRow[] = live.map((group) => {
    const value = byGroup.get(group.id) ?? 0
    const actualBps = share(value)
    if (actualBps === null) {
      return { group, value, actualBps, targetBps: group.target, gapBps: null, status: null }
    }
    const gapBps = actualBps - group.target
    const allowed = allowedGap(group.target, tolerance)
    const status = gapBps > allowed ? 'over' : gapBps < -allowed ? 'under' : 'on'
    return { group, value, actualBps, targetBps: group.target, gapBps, status }
  })
  if (ungrouped > 0) {
    out.push({
      group: null,
      value: ungrouped,
      actualBps: share(ungrouped),
      targetBps: null,
      gapBps: null,
      status: null,
    })
  }
  return { rows: out, total }
}

export const groupTargetsTotal = (groups: readonly AllocationGroup[]) =>
  liveGroups(groups).reduce((sum, g) => sum + g.target, 0)

export interface GroupDraft {
  /** Missing for a group added in this edit. */
  id?: string
  name: string
  /** Basis points. */
  target: number
}

/** Why an edited Allocation table can't be saved, or null when it can. */
export function allocationProblem(drafts: readonly GroupDraft[]): string | null {
  const names = new Set<string>()
  for (const d of drafts) {
    const name = d.name.trim().toLowerCase()
    if (!name) return 'Give every group a name.'
    if (names.has(name)) return `There are two groups called “${d.name.trim()}”.`
    names.add(name)
  }
  const total = drafts.reduce((sum, d) => sum + d.target, 0)
  if (drafts.length > 0 && total !== 10000) return 'Targets must add up to 100%.'
  return null
}

/** Share of investments plus savings held in one asset class, or null when there is nothing. */
export function classShareBps(
  rows: readonly HoldingRow[],
  cash: number,
  assetClass: AssetClass,
): number | null {
  const active = rows.filter((r) => !r.holding.archived)
  const savings = Math.max(0, cash)
  const total = active.reduce((sum, r) => sum + r.value, savings)
  if (total === 0) return null
  const inClass = active
    .filter((r) => r.holding.assetClass === assetClass)
    .reduce((sum, r) => sum + r.value, assetClass === 'cash' ? savings : 0)
  return Math.round((inClass / total) * 10000)
}

/** Version 2 kept one target per asset class in `meta` under this key, with these defaults. */
export const LEGACY_TARGETS_KEY = 'allocation.targets'
const LEGACY_DEFAULT_TARGETS: Partial<Record<AssetClass, number>> = {
  equity: 6000,
  debt: 2500,
  gold: 1000,
  cash: 500,
}

/** Fixed per class, so two devices that upgrade separately make the same groups. */
export const classGroupId = (assetClass: AssetClass) => `ag-${assetClass}`

/**
 * Turns the version 2 per-class targets into groups, one per class that had a target or a
 * holding, so the Allocation table reads the same after the upgrade. Holdings then join the
 * group of their class (`classGroupId`). Nothing is made when there is nothing to carry over.
 */
export function groupsFromClassTargets(
  saved: Partial<Record<AssetClass, number>> | undefined,
  holdings: readonly Holding[],
  now: string,
): AllocationGroup[] {
  const alive = holdings.filter((h) => !h.deletedAt)
  if (!saved && alive.length === 0) return []
  const targets = { ...LEGACY_DEFAULT_TARGETS, ...saved }
  const held = new Set(alive.map((h) => h.assetClass))
  return ASSET_CLASSES.filter((c) => (targets[c] ?? 0) > 0 || held.has(c)).map((c, order) => ({
    id: classGroupId(c),
    createdAt: now,
    updatedAt: now,
    name: ASSET_CLASS_LABELS[c],
    target: targets[c] ?? 0,
    order,
  }))
}

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

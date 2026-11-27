import { shiftMonth } from '../lib/dates'
import { balanceOn } from './balances'
import { lastDayOf, valuationAt } from './investments'
import { balanceAt } from './loans'
import { monthlyTotals } from './analytics'
import {
  NET_WORTH_BUCKETS,
  type Account,
  type HoldingKind,
  type Holding,
  type Loan,
  type LoanBalance,
  type NetWorthBucket,
  type NetWorthSnapshot,
  type Transaction,
  type Valuation,
} from './types'

export type Lines = Record<NetWorthBucket, number>

export const emptyLines = (): Lines =>
  Object.fromEntries(NET_WORTH_BUCKETS.map((b) => [b, 0])) as Lines

export const BUCKET_LABELS: Record<NetWorthBucket, string> = {
  savings: 'Savings accounts',
  fd: 'Fixed deposits',
  mutual_fund: 'Mutual funds',
  stock: 'Stocks and ETFs',
  epf: 'EPF',
  ppf: 'PPF',
  nps: 'NPS',
  gold: 'Gold',
  crypto: 'Crypto',
  property: 'Property',
  other_assets: 'Other assets',
  money_lent: 'Money lent',
  home_loan: 'Home loan',
  other_loans: 'Other loans',
  card_dues: 'Credit card dues',
}

/** Buckets that are things you own, and buckets that are things you owe. */
export const ASSET_BUCKETS: readonly NetWorthBucket[] = [
  'savings',
  'fd',
  'mutual_fund',
  'stock',
  'epf',
  'ppf',
  'nps',
  'gold',
  'crypto',
  'property',
  'other_assets',
  'money_lent',
]
export const LIABILITY_BUCKETS: readonly NetWorthBucket[] = [
  'home_loan',
  'other_loans',
  'card_dues',
]

/** What the tracker counts as "investments": everything held for growth, not cash, property or loans. */
export const INVESTMENT_BUCKETS: readonly NetWorthBucket[] = [
  'fd',
  'mutual_fund',
  'stock',
  'epf',
  'ppf',
  'nps',
  'gold',
  'crypto',
]

const BUCKET_OF_KIND: Record<HoldingKind, NetWorthBucket> = {
  mutual_fund: 'mutual_fund',
  stock: 'stock',
  etf: 'stock',
  fd: 'fd',
  bond: 'other_assets',
  gold: 'gold',
  ppf: 'ppf',
  epf: 'epf',
  nps: 'nps',
  crypto: 'crypto',
  property: 'property',
  other: 'other_assets',
}
export const bucketOfKind = (kind: HoldingKind) => BUCKET_OF_KIND[kind]

export interface Summary {
  assets: number
  liabilities: number
  netWorth: number
  investments: number
}

export function summarizeLines(lines: Lines): Summary {
  const sum = (buckets: readonly NetWorthBucket[]) =>
    buckets.reduce((total, b) => total + (lines[b] ?? 0), 0)
  const assets = sum(ASSET_BUCKETS)
  const liabilities = sum(LIABILITY_BUCKETS)
  return {
    assets,
    liabilities,
    netWorth: assets - liabilities,
    investments: sum(INVESTMENT_BUCKETS),
  }
}

export interface Sources {
  accounts: readonly Account[]
  transactions: readonly Transaction[]
  holdings: readonly Holding[]
  valuations: readonly Valuation[]
  loans: readonly Loan[]
  loanBalances: readonly LoanBalance[]
}

export interface Computed {
  lines: Lines
  /** Total put into holdings by that month, from valuations (before-tracking amount not included). */
  invested: number
  /** Holdings with no value entered for exactly this month (carried forward or missing). */
  staleHoldings: Holding[]
  /** Active loans with no balance entered for exactly this month. */
  staleLoans: Loan[]
}

/**
 * Fills every net worth line for `month` from what PocketLog already knows. The person can
 * still change any figure before closing the month.
 */
export function computeLines(month: string, s: Sources): Computed {
  const lines = emptyLines()
  const end = lastDayOf(month)

  for (const a of s.accounts) {
    if (a.deletedAt) continue
    const balance = balanceOn(a, s.transactions, end)
    if (a.type === 'credit_card') lines.card_dues += Math.max(0, -balance)
    else if (a.type !== 'investment') lines.savings += balance
  }

  const staleHoldings: Holding[] = []
  let invested = 0
  for (const h of s.holdings) {
    if (h.deletedAt) continue
    const v = valuationAt(h.id, s.valuations, month)
    const exact = v?.month === month
    // A sold or closed holding only counts in months it actually has a value.
    if (!v || (h.archived && !exact)) continue
    if (!exact) staleHoldings.push(h)
    lines[bucketOfKind(h.kind)] += v.value
    invested += v.invested
  }

  const staleLoans: Loan[] = []
  for (const l of s.loans) {
    if (l.deletedAt) continue
    const b = balanceAt(l.id, s.loanBalances, month)
    const exact = b?.month === month
    if (l.active && !exact) staleLoans.push(l)
    if (!b || (!l.active && !exact)) continue
    if (l.direction === 'owed') lines.money_lent += b.outstanding
    else if (l.kind === 'home') lines.home_loan += b.outstanding
    else lines.other_loans += b.outstanding
  }

  return { lines, invested, staleHoldings, staleLoans }
}

export interface SnapshotRow {
  month: string
  lines: Lines
  summary: Summary
  /** Net worth change from the previous closed month, or null for the first. */
  change: number | null
  totalInvested: number
  /** Value of investments minus everything put in. */
  growth: number
}

/** Snapshots oldest first, with the change from one to the next. */
export function snapshotRows(snapshots: readonly NetWorthSnapshot[]): SnapshotRow[] {
  const sorted = snapshots
    .filter((s) => !s.deletedAt)
    .sort((a, b) => a.month.localeCompare(b.month))
  return sorted.map((snap, i) => {
    const lines = { ...emptyLines(), ...snap.lines }
    const summary = summarizeLines(lines)
    const before = sorted[i - 1]
    return {
      month: snap.month,
      lines,
      summary,
      change: before
        ? summary.netWorth - summarizeLines({ ...emptyLines(), ...before.lines }).netWorth
        : null,
      totalInvested: snap.totalInvested,
      growth: summary.investments - snap.totalInvested,
    }
  })
}

/** Net worth now compared with `monthsBack` months earlier. Null when that month wasn't closed. */
export function changeOver(rows: readonly SnapshotRow[], monthsBack: number): number | null {
  const latest = rows[rows.length - 1]
  if (!latest) return null
  const earlier = rows.find((r) => r.month === shiftMonth(latest.month, -monthsBack))
  return earlier ? latest.summary.netWorth - earlier.summary.netWorth : null
}

export interface SavingsRate {
  /** 0 to 1 (can be negative), or null when there was no income. */
  rate: number | null
  /** Months that had any income or spending. */
  months: number
}

/** Saved ÷ earned over the last `count` months, from transactions (refunds already netted). */
export function savingsRate(
  transactions: readonly Transaction[],
  endMonth: string,
  count = 12,
): SavingsRate {
  const totals = monthlyTotals(transactions, endMonth, count).filter(
    (m) => m.income > 0 || m.expense > 0,
  )
  const income = totals.reduce((s, m) => s + m.income, 0)
  const net = totals.reduce((s, m) => s + m.net, 0)
  return { rate: income > 0 ? net / income : null, months: totals.length }
}

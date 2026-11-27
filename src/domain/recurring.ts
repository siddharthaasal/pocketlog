import { addDays, monthOf, shiftMonth } from '../lib/dates'
import { payeeKey } from './reconcile'
import type { BillingPeriod, Policy, Subscription, Transaction } from './types'

const MONTHS: Record<BillingPeriod, number> = { monthly: 1, quarterly: 3, yearly: 12 }

/** Cost per month, in paise, whatever the billing period. */
export const perMonth = (cost: number, billing: BillingPeriod) => Math.round(cost / MONTHS[billing])

/** Cost per year, in paise. */
export const perYear = (cost: number, billing: BillingPeriod) =>
  Math.round((cost * 12) / MONTHS[billing])

/** Adds whole months to a date, keeping the day (or the month's last day if it is shorter). */
export function addMonths(date: string, months: number): string {
  const day = Number(date.slice(8, 10))
  const target = shiftMonth(monthOf(date), months)
  const [y = 0, m = 1] = target.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${target}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}

/** The first renewal strictly after `after`, stepping from `from` by the billing period. */
export function nextRenewalAfter(from: string, billing: BillingPeriod, after: string): string {
  let next = from
  // A guard, not a limit anyone reaches: 12 months a year for a century.
  for (let i = 0; i < 1200 && next <= after; i++) next = addMonths(next, MONTHS[billing])
  return next
}

export interface RecurringTotals {
  perMonth: number
  perYear: number
  /** What leaves each month on items marked "cancel" and not yet cancelled. */
  cancelPerMonth: number
}

/** Active items and those marked "cancel" still bill you, so both count towards the cost. */
export function recurringTotals(
  items: readonly { cost: number; billing: BillingPeriod; status: string }[],
): RecurringTotals {
  const totals: RecurringTotals = { perMonth: 0, perYear: 0, cancelPerMonth: 0 }
  for (const s of items) {
    if (s.status !== 'active' && s.status !== 'cancel') continue
    const month = perMonth(s.cost, s.billing)
    totals.perMonth += month
    totals.perYear += perYear(s.cost, s.billing)
    if (s.status === 'cancel') totals.cancelPerMonth += month
  }
  return totals
}

/** The name a charge goes by in your history. */
export const chargeName = (t: Pick<Transaction, 'description' | 'merchant'>) =>
  t.merchant?.trim() || t.description.trim()

/** "netflix" and "netflix com" are the same payee: one key is the start of the other. */
export const samePayee = (a: string, b: string) =>
  a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `)

/**
 * Expenses that look like charges from this payee. By default only those not yet linked to a
 * subscription; pass `untaggedOnly: false` to see them all (policies have no link field).
 */
export function matchingCharges(
  key: string,
  transactions: readonly Transaction[],
  untaggedOnly = true,
): Transaction[] {
  if (!key) return []
  return transactions.filter(
    (t) =>
      !t.deletedAt &&
      t.type === 'expense' &&
      (!untaggedOnly || !t.subscriptionId) &&
      samePayee(payeeKey(chargeName(t)), key),
  )
}

export interface RecurringSuggestion {
  payeeKey: string
  name: string
  /** The most recent amount. */
  cost: number
  billing: BillingPeriod
  lastDate: string
  nextRenewal: string
  count: number
  transactionIds: string[]
}

const gapDays = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

/**
 * Finds payments that repeat on a schedule: at least three charges about a month apart, or two
 * about a year apart, for similar amounts. Already-known payees and anything the person has
 * dismissed are left out.
 */
export function suggestRecurring(
  transactions: readonly Transaction[],
  known: ReadonlySet<string>,
  today: string,
): RecurringSuggestion[] {
  const groups = new Map<string, Transaction[]>()
  for (const t of transactions) {
    if (t.deletedAt || t.type !== 'expense' || t.subscriptionId || t.loanId) continue
    const key = payeeKey(chargeName(t))
    if (!key || [...known].some((k) => samePayee(k, key))) continue
    const group = groups.get(key)
    if (group) group.push(t)
    else groups.set(key, [t])
  }

  const found: RecurringSuggestion[] = []
  for (const [key, all] of groups) {
    const rows = [...all].sort((a, b) => a.date.localeCompare(b.date))
    const last = rows[rows.length - 1]!
    const similar = rows.filter((t) => Math.abs(t.amount - last.amount) <= last.amount * 0.1)
    if (similar.length < 2) continue
    const gaps = similar.slice(1).map((t, i) => gapDays(similar[i]!.date, t.date))
    const within = (min: number, max: number) => gaps.every((g) => g >= min && g <= max)

    let billing: BillingPeriod | null = null
    if (similar.length >= 3 && within(26, 35)) billing = 'monthly'
    else if (similar.length >= 3 && within(84, 98)) billing = 'quarterly'
    else if (within(355, 375)) billing = 'yearly'
    if (!billing) continue

    const lastSimilar = similar[similar.length - 1]!
    found.push({
      payeeKey: key,
      name: chargeName(lastSimilar) || key,
      cost: lastSimilar.amount,
      billing,
      lastDate: lastSimilar.date,
      nextRenewal: nextRenewalAfter(lastSimilar.date, billing, addDays(today, -1)),
      count: similar.length,
      transactionIds: similar.map((t) => t.id),
    })
  }
  return found.sort((a, b) => perYear(b.cost, b.billing) - perYear(a.cost, a.billing))
}

/** Payee keys already covered by a subscription or policy. */
export function knownPayees(
  items: readonly (
    Pick<Subscription, 'payeeKey' | 'deletedAt'> | Pick<Policy, 'payeeKey' | 'deletedAt'>
  )[],
): Set<string> {
  return new Set(items.filter((i) => !i.deletedAt && i.payeeKey).map((i) => i.payeeKey!))
}

/** Renewals that fall within the next `days` days, soonest first. */
export function upcomingRenewals<T extends { renewal?: string | undefined }>(
  items: readonly T[],
  today: string,
  days: number,
): T[] {
  const limit = addDays(today, days)
  return items
    .filter((i) => i.renewal && i.renewal >= today && i.renewal <= limit)
    .sort((a, b) => a.renewal!.localeCompare(b.renewal!))
}

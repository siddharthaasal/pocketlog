import { shiftMonth, monthOf } from '../lib/dates'
import type { Loan, LoanBalance, Transaction } from './types'

/** The newest balance of each loan. */
export function latestBalances(balances: readonly LoanBalance[]): Map<string, LoanBalance> {
  const latest = new Map<string, LoanBalance>()
  for (const b of balances) {
    if (b.deletedAt) continue
    const current = latest.get(b.loanId)
    if (!current || b.month > current.month) latest.set(b.loanId, b)
  }
  return latest
}

/** A loan's balance for `month`, or the latest one before it. */
export function balanceAt(
  loanId: string,
  balances: readonly LoanBalance[],
  month: string,
): LoanBalance | undefined {
  let best: LoanBalance | undefined
  for (const b of balances) {
    if (b.deletedAt || b.loanId !== loanId || b.month > month) continue
    if (!best || b.month > best.month) best = b
  }
  return best
}

export interface LoanRow {
  loan: Loan
  /** Null until a balance has been entered. */
  outstanding: number | null
  asOf: string | null
  /** Share of the original amount already repaid, 0 to 1, when both are known. */
  repaid: number | null
}

export function loanRows(
  loans: readonly Loan[],
  balances: readonly LoanBalance[],
  month: string,
): LoanRow[] {
  return loans
    .filter((l) => !l.deletedAt)
    .map((loan) => {
      const b = balanceAt(loan.id, balances, month)
      const repaid =
        b && loan.principal && loan.principal > 0
          ? Math.min(1, Math.max(0, 1 - b.outstanding / loan.principal))
          : null
      return { loan, outstanding: b?.outstanding ?? null, asOf: b?.month ?? null, repaid }
    })
}

export interface LoanTotals {
  /** Money you lent that is still due back. */
  lent: number
  homeLoan: number
  otherLoans: number
  /** What leaves your accounts each month across active loans you owe. */
  monthlyEmi: number
}

/** The figures the net worth snapshot needs, from active loans only. */
export function loanTotals(rows: readonly LoanRow[]): LoanTotals {
  const totals: LoanTotals = { lent: 0, homeLoan: 0, otherLoans: 0, monthlyEmi: 0 }
  for (const { loan, outstanding } of rows) {
    if (!loan.active) continue
    if (loan.direction === 'owed') totals.lent += outstanding ?? 0
    else {
      if (loan.kind === 'home') totals.homeLoan += outstanding ?? 0
      else totals.otherLoans += outstanding ?? 0
      totals.monthlyEmi += loan.emi ?? 0
    }
  }
  return totals
}

/** Paid so far through transactions tagged to the loan, optionally up to a date. */
export function repaymentsOf(loanId: string, transactions: readonly Transaction[]): Transaction[] {
  return transactions
    .filter((t) => t.loanId === loanId && !t.deletedAt)
    .sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * Best guess at the outstanding amount for `month`, rolled forward from the last known balance:
 * add a month's interest, subtract what you paid that month. Only for loans you owe, and only
 * when there is a balance, a rate and at least one month to roll. A suggestion to check
 * against the lender's statement, never a stored fact.
 */
export function estimateOutstanding(
  loan: Loan,
  balances: readonly LoanBalance[],
  transactions: readonly Transaction[],
  month: string,
): number | null {
  if (loan.direction !== 'owe') return null
  const last = balanceAt(loan.id, balances, month)
  if (!last || last.month >= month) return null
  const paid = new Map<string, number>()
  for (const t of transactions) {
    if (t.loanId !== loan.id || t.deletedAt) continue
    const m = monthOf(t.date)
    paid.set(m, (paid.get(m) ?? 0) + t.amount)
  }
  let balance = last.outstanding
  for (let m = shiftMonth(last.month, 1); m <= month; m = shiftMonth(m, 1)) {
    const interest = Math.round((balance * (loan.rate ?? 0)) / 1200 / 100)
    balance = Math.max(0, balance + interest - (paid.get(m) ?? 0))
  }
  return balance
}

/** Months left until `endDate`, never negative. Null without an end date. */
export function monthsLeft(loan: Loan, today: string): number | null {
  if (!loan.endDate) return null
  const [ty = 0, tm = 1] = today.split('-').map(Number)
  const [ey = 0, em = 1] = loan.endDate.split('-').map(Number)
  return Math.max(0, (ey - ty) * 12 + (em - tm))
}

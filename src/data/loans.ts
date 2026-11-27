import { loanBalanceSchema, loanSchema, type Loan, type LoanBalance } from '../domain/types'
import { db } from './db'
import { monthRowId, removeRecord, saveRecord } from './records'

export type LoanInput = Pick<Loan, 'name' | 'direction' | 'kind'> &
  Partial<
    Pick<
      Loan,
      'party' | 'startDate' | 'endDate' | 'principal' | 'rate' | 'emi' | 'accountId' | 'notes'
    >
  >

/** Pass `id` to edit. New loans start active. */
export function saveLoan(input: LoanInput, id?: string): Promise<Loan> {
  return saveRecord(db.loans, loanSchema, { active: true, ...input }, id)
}

export function setLoanActive(id: string, active: boolean): Promise<Loan> {
  return saveRecord(db.loans, loanSchema, { active }, id)
}

export function removeLoan(id: string): Promise<void> {
  return removeRecord(db.loans, id)
}

/** One balance per loan per month: saving again replaces it. */
export function saveLoanBalance(
  loanId: string,
  month: string,
  outstanding: number,
): Promise<LoanBalance> {
  return saveRecord(
    db.loanBalances,
    loanBalanceSchema,
    { loanId, month, outstanding },
    monthRowId('lb', loanId, month),
  )
}

export async function saveLoanBalances(
  month: string,
  entries: readonly { loanId: string; outstanding: number }[],
): Promise<void> {
  await db.transaction('rw', db.loanBalances, async () => {
    for (const e of entries) await saveLoanBalance(e.loanId, month, e.outstanding)
  })
}

export function deleteLoanBalance(id: string): Promise<void> {
  return removeRecord(db.loanBalances, id)
}

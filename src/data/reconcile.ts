import type { TransactionInput } from '../domain/types'
import { nowISO } from '../lib/ids'
import { useMeta } from './hooks'
import { db } from './db'
import { addTransaction } from './repo'

const IGNORE_KEY = 'reconcile.ignore'

export interface NewEntry {
  input: TransactionInput
  /** Statement row key; omitted for transfers, which rematch by amount and date. */
  bankRef?: string
  /** Set instead of `bankRef` when the entry comes from a swept email. */
  emailRef?: string
  needsReview: boolean
}

/** Adds all entries or none. */
export async function addStatementEntries(entries: readonly NewEntry[]): Promise<void> {
  await db.transaction('rw', [db.transactions, db.accounts, db.categories], async () => {
    for (const { input, bankRef, emailRef, needsReview } of entries) {
      await addTransaction(input, {
        source: 'import',
        needsReview,
        ...(bankRef && { bankRef }),
        ...(emailRef && { emailRef }),
      })
    }
  })
}

/** Remembers which bank row an existing entry corresponds to. */
export async function linkTransactions(links: readonly { id: string; bankRef: string }[]) {
  const now = nowISO()
  await db.transaction('rw', db.transactions, async () => {
    for (const { id, bankRef } of links) {
      await db.transactions.update(id, { bankRef, updatedAt: now })
    }
  })
}

/** Remembers which swept email an existing entry corresponds to. */
export async function linkEmails(links: readonly { id: string; emailRef: string }[]) {
  const now = nowISO()
  await db.transaction('rw', db.transactions, async () => {
    for (const { id, emailRef } of links) {
      await db.transactions.update(id, { emailRef, updatedAt: now })
    }
  })
}

/** Corrects an entry to the amount in the email and links it. */
export async function applyEmailAmount(id: string, amount: number, emailRef: string) {
  await db.transactions.update(id, { amount, emailRef, updatedAt: nowISO() })
}

/** Corrects an entry to the bank's amount and links it. */
export async function applyStatementAmount(id: string, amount: number, bankRef: string) {
  await db.transactions.update(id, { amount, bankRef, needsReview: false, updatedAt: nowISO() })
}

async function ignoredPayees(): Promise<string[]> {
  return ((await db.meta.get(IGNORE_KEY))?.value as string[] | undefined) ?? []
}

export async function addIgnoredPayee(key: string): Promise<void> {
  const current = await ignoredPayees()
  if (!current.includes(key)) await db.meta.put({ key: IGNORE_KEY, value: [...current, key] })
}

export async function removeIgnoredPayee(key: string): Promise<void> {
  const current = await ignoredPayees()
  await db.meta.put({ key: IGNORE_KEY, value: current.filter((k) => k !== key) })
}

/** Payee keys the user chose to always skip while reconciling. */
export function useIgnoredPayees(): string[] | undefined {
  const meta = useMeta<string[]>(IGNORE_KEY)
  return meta ? (meta.value ?? []) : undefined
}

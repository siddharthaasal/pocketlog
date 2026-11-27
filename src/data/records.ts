import type { EntityTable } from 'dexie'
import { newId, nowISO } from '../lib/ids'
import { db } from './db'
import { accountBalanceSchema, type AccountBalance } from '../domain/types'

interface Versioned {
  id: string
  createdAt: string
  updatedAt: string
  deletedAt?: string | undefined
}

/** Dexie's generic key types don't resolve for a generic row type; this is the shape we use. */
function loose<R extends Versioned>(table: EntityTable<R, 'id'>) {
  return table as unknown as {
    get(id: string): Promise<R | undefined>
    put(row: R): Promise<unknown>
    update(id: string, changes: object): Promise<unknown>
  }
}

/**
 * Creates or updates one record of a finance tracker table. Pass an `id` to update (or to
 * create with a deterministic id, e.g. one valuation per holding per month). Saving a deleted
 * record brings it back.
 */
export async function saveRecord<R extends Versioned>(
  table: EntityTable<R, 'id'>,
  schema: { parse(value: unknown): R },
  fields: Record<string, unknown>,
  id: string = newId(),
): Promise<R> {
  const t = loose(table)
  const now = nowISO()
  const existing = await t.get(id)
  const { deletedAt: _restored, ...kept } = (existing ?? {}) as Partial<R>
  const next = schema.parse({
    ...kept,
    ...fields,
    id,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  })
  await t.put(next)
  return next
}

/** Soft delete, so the deletion travels to other devices in a backup merge. */
export async function removeRecord<R extends Versioned>(
  table: EntityTable<R, 'id'>,
  id: string,
): Promise<void> {
  const now = nowISO()
  await loose(table).update(id, { deletedAt: now, updatedAt: now })
}

/** Month-end rows get one id per owner and month, so saving twice replaces rather than duplicates. */
export const monthRowId = (prefix: string, ownerId: string, month: string) =>
  `${prefix}-${ownerId}-${month}`

/** Records the balance a statement printed for an account on a date. */
export function saveAccountBalance(
  accountId: string,
  date: string,
  balance: number,
  source: AccountBalance['source'],
): Promise<AccountBalance> {
  return saveRecord(
    db.accountBalances,
    accountBalanceSchema,
    { accountId, date, balance, source },
    monthRowId('ab', accountId, date),
  )
}

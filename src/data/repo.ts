import { ValidationError } from '../domain/errors'
import {
  accountSchema,
  categorySchema,
  transactionInputSchema,
  transactionSchema,
  type Account,
  type Category,
  type Transaction,
  type TransactionInput,
} from '../domain/types'
import { newId, nowISO } from '../lib/ids'
import { db } from './db'

// ---------- Transactions ----------

interface AddOptions {
  source?: Transaction['source']
  needsReview?: boolean
}

/** Checks that referenced accounts/categories exist, are active and match the transaction type. */
async function assertReferences(t: TransactionInput): Promise<void> {
  const errors: Record<string, string> = {}
  const account = await db.accounts.get(t.accountId)
  if (!account || account.deletedAt) errors.accountId = 'Account not found'
  if (t.toAccountId) {
    const to = await db.accounts.get(t.toAccountId)
    if (!to || to.deletedAt) errors.toAccountId = 'Account not found'
  }
  if (t.categoryId) {
    const category = await db.categories.get(t.categoryId)
    if (!category || category.deletedAt) errors.categoryId = 'Category not found'
    else if (category.type !== t.type) errors.categoryId = `Pick an ${t.type} category`
  }
  if (Object.keys(errors).length > 0) throw new ValidationError(errors)
}

export async function addTransaction(
  input: TransactionInput,
  { source = 'manual', needsReview = false }: AddOptions = {},
): Promise<Transaction> {
  const fields = transactionInputSchema.parse(input)
  const now = nowISO()
  const transaction = transactionSchema.parse({
    ...fields,
    id: newId(),
    currency: 'INR',
    source,
    needsReview,
    createdAt: now,
    updatedAt: now,
  })
  await db.transaction('rw', db.transactions, db.accounts, db.categories, async () => {
    await assertReferences(fields)
    await db.transactions.add(transaction)
  })
  return transaction
}

/** Replaces all editable fields. Editing a transaction also marks it as reviewed. */
export async function updateTransaction(id: string, input: TransactionInput): Promise<Transaction> {
  const fields = transactionInputSchema.parse(input)
  return db.transaction('rw', db.transactions, db.accounts, db.categories, async () => {
    const existing = await db.transactions.get(id)
    if (!existing || existing.deletedAt) throw new Error('This transaction no longer exists.')
    await assertReferences(fields)
    const next = transactionSchema.parse({
      id: existing.id,
      currency: existing.currency,
      source: existing.source,
      createdAt: existing.createdAt,
      ...fields,
      needsReview: false,
      updatedAt: nowISO(),
    })
    await db.transactions.put(next)
    return next
  })
}

export async function deleteTransaction(id: string): Promise<void> {
  const now = nowISO()
  await db.transactions.update(id, { deletedAt: now, updatedAt: now })
}

// ---------- Categories ----------

export type CategoryInput = Pick<Category, 'name' | 'type' | 'icon' | 'color' | 'keywords'>

async function assertUniqueName(
  rows: readonly { id: string; name: string; deletedAt?: string | undefined }[],
  name: string,
  exceptId?: string,
): Promise<void> {
  const wanted = name.trim().toLowerCase()
  const clash = rows.find(
    (r) => !r.deletedAt && r.id !== exceptId && r.name.trim().toLowerCase() === wanted,
  )
  if (clash) throw new ValidationError({ name: `“${clash.name}” already exists` })
}

export async function addCategory(input: CategoryInput): Promise<Category> {
  const now = nowISO()
  const category = categorySchema.parse({
    ...input,
    id: newId(),
    archived: false,
    createdAt: now,
    updatedAt: now,
  })
  await db.transaction('rw', db.categories, async () => {
    const sameType = await db.categories.where('type').equals(category.type).toArray()
    await assertUniqueName(sameType, category.name)
    await db.categories.add(category)
  })
  return category
}

/** Category type can't change once created; transactions depend on it. */
export async function updateCategory(
  id: string,
  changes: Partial<Omit<CategoryInput, 'type'>> & { archived?: boolean },
): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    const existing = await db.categories.get(id)
    if (!existing || existing.deletedAt) throw new Error('This category no longer exists.')
    const next = categorySchema.parse({ ...existing, ...changes, updatedAt: nowISO() })
    const sameType = await db.categories.where('type').equals(next.type).toArray()
    await assertUniqueName(sameType, next.name, id)
    await db.categories.put(next)
  })
}

// ---------- Accounts ----------

export type AccountInput = Pick<
  Account,
  'name' | 'type' | 'openingBalance' | 'aliases' | 'isDefault'
>

async function clearOtherDefaults(exceptId: string, now: string): Promise<void> {
  const others = await db.accounts.filter((a) => a.isDefault && a.id !== exceptId).toArray()
  await Promise.all(
    others.map((a) => db.accounts.update(a.id, { isDefault: false, updatedAt: now })),
  )
}

export async function addAccount(input: AccountInput): Promise<Account> {
  const now = nowISO()
  const account = accountSchema.parse({
    ...input,
    id: newId(),
    currency: 'INR',
    archived: false,
    createdAt: now,
    updatedAt: now,
  })
  await db.transaction('rw', db.accounts, async () => {
    await assertUniqueName(await db.accounts.toArray(), account.name)
    if (account.isDefault) await clearOtherDefaults(account.id, now)
    await db.accounts.add(account)
  })
  return account
}

export async function updateAccount(
  id: string,
  changes: Partial<AccountInput> & { archived?: boolean },
): Promise<void> {
  await db.transaction('rw', db.accounts, async () => {
    const existing = await db.accounts.get(id)
    if (!existing || existing.deletedAt) throw new Error('This account no longer exists.')
    const now = nowISO()
    const next = accountSchema.parse({ ...existing, ...changes, updatedAt: now })
    // An archived account can't be the default for new transactions.
    if (next.archived) next.isDefault = false
    await assertUniqueName(await db.accounts.toArray(), next.name, id)
    if (next.isDefault) await clearOtherDefaults(id, now)
    await db.accounts.put(next)
  })
}

/** The account new transactions start with: the marked default, else the first active one. */
export function pickDefaultAccount(accounts: readonly Account[]): Account | undefined {
  const active = accounts.filter((a) => !a.archived && !a.deletedAt)
  return active.find((a) => a.isDefault) ?? active[0]
}

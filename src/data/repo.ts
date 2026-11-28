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
  /** A deterministic id, so the same Siri entry imported on two devices merges as one. */
  id?: string
  /** The bank-statement row this was created from (see domain/reconcile). */
  bankRef?: string
  /** The swept email this was created from (see domain/emailSweep). */
  emailRef?: string
}

/** Only the tables this transaction needs, so statement imports can nest inside their own transaction. */
const txTables = (t: TransactionInput) => [
  db.transactions,
  db.accounts,
  db.categories,
  ...(t.loanId ? [db.loans] : []),
  ...(t.subscriptionId ? [db.subscriptions] : []),
  ...(t.holdingId ? [db.holdings] : []),
]

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
    // A refund carries the category of the expense it refunds, so it reduces that spending.
    const wanted = t.refundOf ? 'expense' : t.type
    if (!category || category.deletedAt) errors.categoryId = 'Category not found'
    else if (category.type !== wanted) errors.categoryId = `Pick an ${wanted} category`
  }
  for (const part of t.splits ?? []) {
    const category = await db.categories.get(part.categoryId)
    if (!category || category.deletedAt || category.type !== 'expense') {
      errors.splits = 'A part of the split has no expense category'
    }
  }
  if (t.refundOf) {
    const original = await db.transactions.get(t.refundOf)
    if (!original || original.deletedAt || original.type !== 'expense') {
      errors.refundOf = 'Pick the expense this refunds'
    }
  }
  // Looked up lazily: callers that import statement rows open a transaction without these tables.
  const links: [keyof TransactionInput & string, string | undefined, () => Promise<unknown>][] = [
    ['loanId', t.loanId, () => db.loans.get(t.loanId!)],
    ['subscriptionId', t.subscriptionId, () => db.subscriptions.get(t.subscriptionId!)],
    ['holdingId', t.holdingId, () => db.holdings.get(t.holdingId!)],
  ]
  for (const [field, target, lookup] of links) {
    if (!target) continue
    const row = (await lookup()) as { deletedAt?: string } | undefined
    if (!row || row.deletedAt) errors[field] = 'Not found'
  }
  if (Object.keys(errors).length > 0) throw new ValidationError(errors)
}

export async function addTransaction(
  input: TransactionInput,
  { source = 'manual', needsReview = false, id = newId(), bankRef, emailRef }: AddOptions = {},
): Promise<Transaction> {
  const fields = transactionInputSchema.parse(input)
  const now = nowISO()
  const transaction = transactionSchema.parse({
    ...fields,
    id,
    currency: 'INR',
    source,
    needsReview,
    ...(bankRef && { bankRef }),
    ...(emailRef && { emailRef }),
    createdAt: now,
    updatedAt: now,
  })
  await db.transaction('rw', txTables(fields), async () => {
    await assertReferences(fields)
    await db.transactions.add(transaction)
  })
  return transaction
}

/** Replaces all editable fields. Editing a transaction also marks it as reviewed. */
export async function updateTransaction(id: string, input: TransactionInput): Promise<Transaction> {
  const fields = transactionInputSchema.parse(input)
  return db.transaction('rw', txTables(fields), async () => {
    const existing = await db.transactions.get(id)
    if (!existing || existing.deletedAt) throw new Error('This transaction no longer exists.')
    await assertReferences(fields)
    const next = transactionSchema.parse({
      id: existing.id,
      currency: existing.currency,
      source: existing.source,
      createdAt: existing.createdAt,
      ...(existing.bankRef && { bankRef: existing.bankRef }),
      ...(existing.emailRef && { emailRef: existing.emailRef }),
      ...fields,
      needsReview: false,
      updatedAt: nowISO(),
    })
    await db.transactions.put(next)
    return next
  })
}

export type BulkChange =
  | { kind: 'category'; categoryId: string }
  | { kind: 'account'; accountId: string }
  | { kind: 'addTag'; tag: string }
  | { kind: 'removeTag'; tag: string }

/**
 * Applies one change to several transactions, all or nothing. Rows the change doesn't fit are
 * left as they are and counted: a transfer has no category, an income can't take an expense
 * category, a split keeps its parts, and a transfer can't go to the account it comes from.
 */
export async function bulkUpdateTransactions(
  ids: readonly string[],
  change: BulkChange,
): Promise<{ updated: number; skipped: number }> {
  let updated = 0
  let skipped = 0
  await db.transaction('rw', db.transactions, db.categories, db.accounts, async () => {
    const category = change.kind === 'category' ? await db.categories.get(change.categoryId) : null
    if (change.kind === 'category' && (!category || category.deletedAt)) {
      throw new Error('That category no longer exists.')
    }
    if (change.kind === 'account') {
      const account = await db.accounts.get(change.accountId)
      if (!account || account.deletedAt) throw new Error('That account no longer exists.')
    }
    const tag = 'tag' in change ? change.tag.trim().toLowerCase() : ''
    const now = nowISO()
    for (const id of ids) {
      const t = await db.transactions.get(id)
      if (!t || t.deletedAt) continue
      let fields: Partial<Transaction> | null = null
      switch (change.kind) {
        case 'category': {
          const wanted = t.refundOf ? 'expense' : t.type
          if (t.type !== 'transfer' && !t.splits && category!.type === wanted) {
            fields = { categoryId: category!.id, needsReview: false }
          }
          break
        }
        case 'account':
          if (t.toAccountId !== change.accountId) fields = { accountId: change.accountId }
          break
        case 'addTag': {
          const tags = t.tags ?? []
          if (tag && !tags.includes(tag) && tags.length < 10) fields = { tags: [...tags, tag] }
          break
        }
        case 'removeTag':
          if (t.tags?.includes(tag)) {
            const rest = t.tags.filter((x) => x !== tag)
            fields = { tags: rest.length > 0 ? rest : undefined }
          }
          break
      }
      if (!fields) {
        skipped++
        continue
      }
      await db.transactions.put(transactionSchema.parse({ ...t, ...fields, updatedAt: now }))
      updated++
    }
  })
  return { updated, skipped }
}

/** Soft-deletes several transactions together. */
export async function deleteTransactions(ids: readonly string[]): Promise<void> {
  const now = nowISO()
  await db.transaction('rw', db.transactions, async () => {
    for (const id of ids) await db.transactions.update(id, { deletedAt: now, updatedAt: now })
  })
}

/** Accepts a Siri entry as parsed. */
export async function confirmTransaction(id: string): Promise<void> {
  await db.transactions.update(id, { needsReview: false, updatedAt: nowISO() })
}

export async function deleteTransaction(id: string): Promise<void> {
  const now = nowISO()
  await db.transactions.update(id, { deletedAt: now, updatedAt: now })
}

// ---------- Categories ----------

export type CategoryInput = Pick<Category, 'name' | 'type' | 'icon' | 'color' | 'keywords'> &
  Partial<Pick<Category, 'budget'>>

/** Only expense categories carry a budget. */
const withoutIncomeBudget = <T extends { type: Category['type']; budget?: number | undefined }>(
  c: T,
): T => (c.type === 'income' ? { ...c, budget: undefined } : c)

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
    ...withoutIncomeBudget(input),
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
    const next = categorySchema.parse(
      withoutIncomeBudget({ ...existing, ...changes, updatedAt: nowISO() }),
    )
    const sameType = await db.categories.where('type').equals(next.type).toArray()
    await assertUniqueName(sameType, next.name, id)
    await db.categories.put(next)
  })
}

/** Sets several categories' monthly budgets together, or none. `undefined` removes a budget. */
export async function setCategoryBudgets(
  budgets: readonly { id: string; budget: number | undefined }[],
): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    const now = nowISO()
    for (const { id, budget } of budgets) {
      const existing = await db.categories.get(id)
      if (!existing || existing.deletedAt || existing.type !== 'expense') continue
      if (existing.budget === budget) continue
      await db.categories.put(categorySchema.parse({ ...existing, budget, updatedAt: now }))
    }
  })
}

// ---------- Accounts ----------

export type AccountInput = Pick<
  Account,
  'name' | 'type' | 'openingBalance' | 'aliases' | 'isDefault'
> &
  Partial<
    Pick<
      Account,
      | 'institution'
      | 'holder'
      | 'last4'
      | 'nominee'
      | 'documentsNote'
      | 'openingDate'
      | 'creditLimit'
      | 'statementDay'
      | 'dueDay'
    >
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

export { pickDefaultAccount } from '../domain/accounts'

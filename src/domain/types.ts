import { z } from 'zod'

export const TRANSACTION_TYPES = ['expense', 'income', 'transfer'] as const
export const CATEGORY_TYPES = ['expense', 'income'] as const
export const ACCOUNT_TYPES = ['cash', 'bank', 'credit_card', 'wallet'] as const
export const PAYMENT_METHODS = ['upi', 'card', 'cash', 'netbanking', 'other'] as const
export const TRANSACTION_SOURCES = ['manual', 'siri', 'import'] as const

export type TransactionType = (typeof TRANSACTION_TYPES)[number]
export type CategoryType = (typeof CATEGORY_TYPES)[number]
export type AccountType = (typeof ACCOUNT_TYPES)[number]
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

const id = z.string().min(1)
const timestamp = z.iso.datetime()
/** Amounts are integers in paise. */
const paise = z.number().int().refine(Number.isSafeInteger, 'Amount is too large')
const optionalText = (max: number) => z.string().trim().max(max).optional()

const recordMeta = {
  id,
  createdAt: timestamp,
  updatedAt: timestamp,
  /** Soft delete marker so deletions survive merge-sync. */
  deletedAt: timestamp.optional(),
}

const transactionInputShape = {
  type: z.enum(TRANSACTION_TYPES),
  amount: paise.positive('Enter an amount'),
  description: z.string().trim().max(200),
  merchant: optionalText(100),
  categoryId: id.optional(),
  accountId: z.string().min(1, 'Choose an account'),
  toAccountId: id.optional(),
  date: z.iso.date('Enter a valid date'),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  notes: optionalText(1000),
}

type TransactionLike = {
  type: TransactionType
  categoryId?: string | undefined
  accountId: string
  toAccountId?: string | undefined
}

function refineTransaction(t: TransactionLike, ctx: z.RefinementCtx) {
  if (t.type === 'transfer') {
    if (!t.toAccountId) {
      ctx.addIssue({
        code: 'custom',
        path: ['toAccountId'],
        message: 'Choose where the money went',
      })
    } else if (t.toAccountId === t.accountId) {
      ctx.addIssue({
        code: 'custom',
        path: ['toAccountId'],
        message: 'Pick two different accounts',
      })
    }
    if (t.categoryId) {
      ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'Transfers have no category' })
    }
  } else {
    if (!t.categoryId) {
      ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'Choose a category' })
    }
    if (t.toAccountId) {
      ctx.addIssue({
        code: 'custom',
        path: ['toAccountId'],
        message: 'Only transfers have a destination account',
      })
    }
  }
}

/** What a user (or the parser) supplies; metadata is added by the repository. */
export const transactionInputSchema = z.object(transactionInputShape).superRefine(refineTransaction)

export const transactionSchema = z
  .object({
    ...recordMeta,
    ...transactionInputShape,
    currency: z.literal('INR'),
    source: z.enum(TRANSACTION_SOURCES),
    needsReview: z.boolean(),
  })
  .superRefine(refineTransaction)

export const categorySchema = z.object({
  ...recordMeta,
  name: z.string().trim().min(1, 'Enter a name').max(40),
  type: z.enum(CATEGORY_TYPES),
  icon: z.string().trim().min(1, 'Pick an icon').max(16),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  /** Words that map dictated text to this category, e.g. "lunch", "swiggy". */
  keywords: z.array(z.string().trim().toLowerCase().min(1)),
  archived: z.boolean(),
})

export const accountSchema = z.object({
  ...recordMeta,
  name: z.string().trim().min(1, 'Enter a name').max(40),
  type: z.enum(ACCOUNT_TYPES),
  /** Paise. Negative for money owed, e.g. a credit card balance. */
  openingBalance: paise,
  currency: z.literal('INR'),
  /** Words that map dictated text to this account, e.g. "hdfc". */
  aliases: z.array(z.string().trim().toLowerCase().min(1)),
  isDefault: z.boolean(),
  archived: z.boolean(),
})

export const inboxEntrySchema = z.object({
  key: z.string().min(1),
  rawText: z.string(),
  recordedAt: z.string(),
  /** imported → became a transaction; unparsed → needs a person; skipped → dismissed. */
  status: z.enum(['imported', 'unparsed', 'skipped']),
  transactionId: id.optional(),
})

export type TransactionInput = z.input<typeof transactionInputSchema>
export type Transaction = z.output<typeof transactionSchema>
export type Category = z.output<typeof categorySchema>
export type Account = z.output<typeof accountSchema>
export type InboxEntry = z.output<typeof inboxEntrySchema>
export type MetaEntry = { key: string; value: unknown }

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Cash',
  bank: 'Bank account',
  credit_card: 'Credit card',
  wallet: 'Wallet',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  upi: 'UPI',
  card: 'Card',
  cash: 'Cash',
  netbanking: 'Net banking',
  other: 'Other',
}

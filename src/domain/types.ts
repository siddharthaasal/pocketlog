import { z } from 'zod'

export const TRANSACTION_TYPES = ['expense', 'income', 'transfer'] as const
export const CATEGORY_TYPES = ['expense', 'income'] as const
export const ACCOUNT_TYPES = ['cash', 'bank', 'credit_card', 'wallet', 'investment'] as const
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
  /** A repayment of this loan. */
  loanId: id.optional(),
  /** A recurring charge for this subscription. */
  subscriptionId: id.optional(),
  /** Money put into this holding. */
  holdingId: id.optional(),
  /** On an income entry: the expense this refunds or reimburses. */
  refundOf: id.optional(),
  /** Your own labels, like "goa trip", for spending that crosses categories. Lowercase. */
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10).optional(),
  /**
   * One expense paid across several categories, e.g. a supermarket bill that is part groceries,
   * part household. The parts add up to `amount`; `categoryId` is the first part's. Balances and
   * bank matching see one payment; spending totals see the parts.
   */
  splits: z.array(z.object({ categoryId: id, amount: paise.positive() })).optional(),
}

type TransactionLike = {
  type: TransactionType
  amount: number
  categoryId?: string | undefined
  splits?: { categoryId: string; amount: number }[] | undefined
  accountId: string
  toAccountId?: string | undefined
  refundOf?: string | undefined
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
    if (t.refundOf) {
      ctx.addIssue({ code: 'custom', path: ['refundOf'], message: 'Only income can be a refund' })
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
    if (t.refundOf && t.type !== 'income') {
      ctx.addIssue({ code: 'custom', path: ['refundOf'], message: 'Only income can be a refund' })
    }
  }
  if (t.splits) {
    const issue = splitProblem(t)
    if (issue) ctx.addIssue({ code: 'custom', path: ['splits'], message: issue })
  }
}

/** Why a split doesn't hold together, or null. */
function splitProblem(t: TransactionLike): string | null {
  const parts = t.splits ?? []
  if (t.type !== 'expense') return 'Only expenses can be split'
  if (parts.length < 2) return 'A split needs at least two parts'
  if (new Set(parts.map((p) => p.categoryId)).size !== parts.length) {
    return 'Use each category once in a split'
  }
  if (parts[0]!.categoryId !== t.categoryId) return 'The first part sets the category'
  const sum = parts.reduce((s, p) => s + p.amount, 0)
  if (sum !== t.amount) return 'The parts must add up to the amount'
  return null
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
    /** Identifies the bank-statement row this came from, so reconciling never duplicates it. */
    bankRef: z.string().max(100).optional(),
    /** Identifies the swept email this matched or came from (see domain/emailSweep). */
    emailRef: z.string().max(100).optional(),
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
  /** Monthly spending limit in paise. Expense categories only. */
  budget: paise.positive('Enter a budget above zero').optional(),
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
  // Optional details from the finance tracker's Accounts sheet. Never full account numbers.
  institution: optionalText(60),
  holder: optionalText(60),
  last4: z
    .string()
    .regex(/^\d{4}$/, 'Enter the last 4 digits')
    .optional(),
  nominee: optionalText(60),
  documentsNote: optionalText(300),
  /** The date `openingBalance` was true. */
  openingDate: z.iso.date().optional(),
  /** Credit cards. Paise. */
  creditLimit: paise.nonnegative().optional(),
  statementDay: z.number().int().min(1).max(31).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
})

export const inboxEntrySchema = z.object({
  key: z.string().min(1),
  rawText: z.string(),
  recordedAt: z.string(),
  /** imported → became a transaction; unparsed → needs a person; skipped → dismissed. */
  status: z.enum(['imported', 'unparsed', 'skipped']),
  transactionId: id.optional(),
})

// ---------- Finance tracker tables ----------

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Enter a month')

export const HOLDING_KINDS = [
  'mutual_fund',
  'stock',
  'etf',
  'fd',
  'bond',
  'gold',
  'ppf',
  'epf',
  'nps',
  'crypto',
  'property',
  'other',
] as const
export const ASSET_CLASSES = [
  'equity',
  'debt',
  'gold',
  'cash',
  'crypto',
  'real_estate',
  'other',
] as const

export const holdingSchema = z.object({
  ...recordMeta,
  name: z.string().trim().min(1, 'Enter a name').max(80),
  kind: z.enum(HOLDING_KINDS),
  assetClass: z.enum(ASSET_CLASSES),
  platform: optionalText(60),
  /** The demat or investment account it sits in. */
  accountId: id.optional(),
  /** The allocation group it counts towards. None, or a deleted group, means "No group". */
  groupId: id.optional(),
  /** Money kept for emergencies, like a liquid fund: counts towards the emergency fund on Home and is left out of Allocation. */
  emergency: z.boolean().optional(),
  /** Set by an import, so the next one finds this holding again: ISIN for shares and ETFs, folio for funds. */
  isin: z
    .string()
    .regex(/^IN[A-Z0-9]{10}$/, 'Not an ISIN')
    .optional(),
  folio: optionalText(30),
  /** Basis points: 710 = 7.10%. For FDs, PPF and bonds. */
  interestRate: z.number().int().min(0).max(10000).optional(),
  maturityDate: z.iso.date().optional(),
  notes: optionalText(500),
  archived: z.boolean(),
})

/** A row of the Allocation table: a name you choose and a target share of your investments. */
export const allocationGroupSchema = z.object({
  ...recordMeta,
  name: z.string().trim().min(1, 'Enter a name').max(40),
  /** Basis points: 2500 = 25%. */
  target: z.number().int().min(0).max(10000),
  /** Position in the table, smallest first. */
  order: z.number().int().min(0),
})

/** What one holding was worth at the end of a month, and how much had gone in by then. */
export const valuationSchema = z.object({
  ...recordMeta,
  holdingId: id,
  month,
  invested: paise.nonnegative(),
  value: paise.nonnegative(),
})

export const LOAN_DIRECTIONS = ['owe', 'owed'] as const
export const LOAN_KINDS = [
  'home',
  'education',
  'car',
  'personal',
  'card_emi',
  'friend_family',
  'other',
] as const

export const loanSchema = z.object({
  ...recordMeta,
  name: z.string().trim().min(1, 'Enter a name').max(80),
  /** `owe`: you owe it. `owed`: money you lent. */
  direction: z.enum(LOAN_DIRECTIONS),
  kind: z.enum(LOAN_KINDS),
  /** Lender, or who you lent to. */
  party: optionalText(80),
  startDate: z.iso.date().optional(),
  /** Last EMI, or the date a lent amount is due back. */
  endDate: z.iso.date().optional(),
  principal: paise.nonnegative().optional(),
  /** Basis points: 1050 = 10.50%. */
  rate: z.number().int().min(0).max(10000).optional(),
  emi: paise.nonnegative().optional(),
  /** The account the EMI leaves from. */
  accountId: id.optional(),
  active: z.boolean(),
  notes: optionalText(500),
})

export const loanBalanceSchema = z.object({
  ...recordMeta,
  loanId: id,
  month,
  outstanding: paise.nonnegative(),
})

export const SUBSCRIPTION_KINDS = [
  'entertainment',
  'music',
  'software',
  'cloud',
  'news',
  'fitness',
  'food_delivery',
  'phone_internet',
  'other',
] as const
export const BILLING_PERIODS = ['monthly', 'quarterly', 'yearly'] as const
export const SUBSCRIPTION_STATUSES = ['active', 'cancel', 'cancelled'] as const

export const subscriptionSchema = z.object({
  ...recordMeta,
  service: z.string().trim().min(1, 'Enter a name').max(80),
  kind: z.enum(SUBSCRIPTION_KINDS),
  /** Per billing period. */
  cost: paise.positive('Enter a cost'),
  billing: z.enum(BILLING_PERIODS),
  nextRenewal: z.iso.date().optional(),
  accountId: id.optional(),
  /** How its charges look in your history (see `payeeKey` in domain/reconcile). */
  payeeKey: optionalText(60),
  status: z.enum(SUBSCRIPTION_STATUSES),
  notes: optionalText(500),
})

export const POLICY_KINDS = ['term', 'health', 'vehicle', 'home', 'other'] as const
export const POLICY_STATUSES = ['active', 'lapsed', 'closed'] as const

export const policySchema = z.object({
  ...recordMeta,
  name: z.string().trim().min(1, 'Enter a name').max(80),
  kind: z.enum(POLICY_KINDS),
  insurer: z.string().trim().min(1, 'Enter the insurer').max(80),
  sumAssured: paise.nonnegative().optional(),
  premium: paise.positive('Enter the premium'),
  frequency: z.enum(BILLING_PERIODS),
  renewalDate: z.iso.date().optional(),
  nominee: optionalText(60),
  accountId: id.optional(),
  payeeKey: optionalText(60),
  status: z.enum(POLICY_STATUSES),
  notes: optionalText(500),
})

/** The balance a bank statement printed for an account on a date. */
export const accountBalanceSchema = z.object({
  ...recordMeta,
  accountId: id,
  date: z.iso.date(),
  balance: paise,
  source: z.enum(['reconcile', 'manual']),
})

export const NET_WORTH_BUCKETS = [
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
  'home_loan',
  'other_loans',
  'card_dues',
] as const
export type NetWorthBucket = (typeof NET_WORTH_BUCKETS)[number]

/** A closed month, frozen so later edits to a loan or holding don't rewrite history. */
export const netWorthSnapshotSchema = z.object({
  ...recordMeta,
  /** `id` equals `month`, so there is one snapshot per month and merges stay simple. */
  month,
  /** Paise per bucket. Liabilities are positive numbers; savings can be negative (overdraft). */
  lines: z.record(z.enum(NET_WORTH_BUCKETS), paise),
  totalInvested: paise.nonnegative(),
  closedAt: timestamp,
})

export type Holding = z.output<typeof holdingSchema>
export type Valuation = z.output<typeof valuationSchema>
export type AllocationGroup = z.output<typeof allocationGroupSchema>
export type Loan = z.output<typeof loanSchema>
export type LoanBalance = z.output<typeof loanBalanceSchema>
export type Subscription = z.output<typeof subscriptionSchema>
export type Policy = z.output<typeof policySchema>
export type AccountBalance = z.output<typeof accountBalanceSchema>
export type NetWorthSnapshot = z.output<typeof netWorthSnapshotSchema>
export type HoldingKind = (typeof HOLDING_KINDS)[number]
export type AssetClass = (typeof ASSET_CLASSES)[number]
export type LoanKind = (typeof LOAN_KINDS)[number]
export type LoanDirection = (typeof LOAN_DIRECTIONS)[number]
export type SubscriptionKind = (typeof SUBSCRIPTION_KINDS)[number]
export type BillingPeriod = (typeof BILLING_PERIODS)[number]
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]
export type PolicyKind = (typeof POLICY_KINDS)[number]
export type PolicyStatus = (typeof POLICY_STATUSES)[number]

export const HOLDING_KIND_LABELS: Record<HoldingKind, string> = {
  mutual_fund: 'Mutual fund',
  stock: 'Stock',
  etf: 'ETF',
  fd: 'Fixed deposit',
  bond: 'Bond',
  gold: 'Gold',
  ppf: 'PPF',
  epf: 'EPF',
  nps: 'NPS',
  crypto: 'Crypto',
  property: 'Property',
  other: 'Other',
}

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  equity: 'Equity',
  debt: 'Debt',
  gold: 'Gold',
  cash: 'Cash',
  crypto: 'Crypto',
  real_estate: 'Real estate',
  other: 'Other',
}

/** The asset class a kind usually belongs to. The user can change it per holding. */
export const DEFAULT_ASSET_CLASS: Record<HoldingKind, AssetClass> = {
  mutual_fund: 'equity',
  stock: 'equity',
  etf: 'equity',
  fd: 'debt',
  bond: 'debt',
  gold: 'gold',
  ppf: 'debt',
  epf: 'debt',
  nps: 'equity',
  crypto: 'crypto',
  property: 'real_estate',
  other: 'other',
}

export const LOAN_KIND_LABELS: Record<LoanKind, string> = {
  home: 'Home loan',
  education: 'Education loan',
  car: 'Car loan',
  personal: 'Personal loan',
  card_emi: 'Credit card EMI',
  friend_family: 'Friend / family',
  other: 'Other',
}

export const SUBSCRIPTION_KIND_LABELS: Record<SubscriptionKind, string> = {
  entertainment: 'Entertainment',
  music: 'Music',
  software: 'Software',
  cloud: 'Cloud storage',
  news: 'News',
  fitness: 'Fitness',
  food_delivery: 'Food delivery',
  phone_internet: 'Phone / internet',
  other: 'Other',
}

export const BILLING_LABELS: Record<BillingPeriod, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}

export const POLICY_KIND_LABELS: Record<PolicyKind, string> = {
  term: 'Term life',
  health: 'Health',
  vehicle: 'Vehicle',
  home: 'Home',
  other: 'Other',
}

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
  investment: 'Investment account',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  upi: 'UPI',
  card: 'Card',
  cash: 'Cash',
  netbanking: 'Net banking',
  other: 'Other',
}

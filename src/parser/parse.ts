import {
  transactionInputSchema,
  type Account,
  type Category,
  type PaymentMethod,
  type TransactionInput,
  type TransactionType,
} from '../domain/types'
import { pickDefaultAccount } from '../domain/accounts'
import { parseRupees } from '../domain/money'
import { extractDate } from './dates'
import { consumePreceding, findPhrase, markUsed, tokenize, type Token } from './tokens'

export interface ParseContext {
  categories: readonly Category[]
  accounts: readonly Account[]
  /** 'YYYY-MM-DD' that relative dates ("yesterday") are measured from. */
  today: string
}

export type ParseIssue =
  'no-amount' | 'multiple-amounts' | 'category-guessed' | 'transfer-accounts' | 'invalid'

export const ISSUE_MESSAGES: Record<ParseIssue, string> = {
  'no-amount': 'No amount found',
  'multiple-amounts': 'More than one amount mentioned',
  'category-guessed': 'Category was guessed',
  'transfer-accounts': 'Couldn’t tell which accounts the transfer was between',
  invalid: 'Some details don’t add up',
}

export interface ParseResult {
  type: TransactionType
  /** Paise. */
  amount?: number
  description: string
  categoryId?: string
  accountId?: string
  toAccountId?: string
  date: string
  paymentMethod?: PaymentMethod
  /** Anything uncertain; a result with issues should be reviewed by a person. */
  issues: ParseIssue[]
  /** A valid transaction, or null when something essential is missing. */
  input: TransactionInput | null
}

const EXPENSE_WORDS = new Set([
  'spent',
  'spend',
  'paid',
  'pay',
  'bought',
  'buy',
  'purchased',
  'cost',
  'costs',
])
const INCOME_WORDS = new Set(['received', 'receive', 'earned', 'earn', 'credited'])
/** "Got" is income only when nothing points to spending: "got groceries" is an expense. */
const WEAK_INCOME_WORDS = new Set(['got', 'get'])
/** Signal income but stay in the description, e.g. "Salary". */
const INCOME_HINTS = new Set(['salary', 'refund', 'refunded', 'cashback', 'income', 'dividend'])
const TRANSFER_WORDS = new Set(['transferred', 'transfer', 'transferring', 'moved', 'move'])
const WITHDRAW_WORDS = new Set(['withdrew', 'withdraw', 'withdrawn', 'withdrawal'])

const CURRENCY_WORDS = new Set(['rs', 'rupees', 'rupee', 'inr', 'bucks'])
const MULTIPLIERS: Record<string, number> = {
  k: 1000,
  thousand: 1000,
  lakh: 100000,
  lakhs: 100000,
  lac: 100000,
  lacs: 100000,
}
const AMOUNT_LEAD_WORDS = new Set(['of', 'for', 'worth'])
const ACCOUNT_PREPOSITIONS = new Set([
  'using',
  'with',
  'via',
  'from',
  'to',
  'into',
  'in',
  'on',
  'by',
  'through',
  'thru',
  'frm',
])
const FILLERS = new Set([
  'on',
  'for',
  'at',
  'to',
  'from',
  'in',
  'the',
  'a',
  'an',
  'my',
  'of',
  'i',
  'some',
  'worth',
  'and',
  'with',
  'via',
  'using',
  'by',
  'just',
  'me',
  'it',
  'is',
  'was',
])

const PAYMENT_PHRASES: [string[], PaymentMethod][] = [
  [['google', 'pay'], 'upi'],
  [['net', 'banking'], 'netbanking'],
  [['upi'], 'upi'],
  [['gpay'], 'upi'],
  [['phonepe'], 'upi'],
  [['phone', 'pe'], 'upi'],
  [['bhim'], 'upi'],
  [['netbanking'], 'netbanking'],
]

const words = (phrase: string) => phrase.toLowerCase().split(/\s+/).filter(Boolean)

interface AmountCandidate {
  paise: number
  hasCurrency: boolean
  indices: number[]
}

function extractAmount(tokens: Token[]): { paise?: number; multiple: boolean } {
  const candidates: AmountCandidate[] = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!
    if (t.used) continue
    const m = /^(\d+(?:\.\d{1,2})?)(k)?$/.exec(t.lower)
    if (!m) continue
    let paise = parseRupees(m[1]!)
    if (paise === null) continue
    const indices = [i]
    let next = i + 1
    const suffix = m[2] ?? tokens[next]?.lower
    const multiplier = suffix ? MULTIPLIERS[suffix] : undefined
    if (multiplier) {
      paise *= multiplier
      if (!m[2]) indices.push(next++)
    }
    let hasCurrency = false
    if (CURRENCY_WORDS.has(tokens[next]?.lower ?? '')) {
      indices.push(next)
      hasCurrency = true
    }
    if (CURRENCY_WORDS.has(tokens[i - 1]?.lower ?? '')) {
      indices.push(i - 1)
      hasCurrency = true
    }
    candidates.push({ paise, hasCurrency, indices })
  }

  const preferred = candidates.some((c) => c.hasCurrency)
    ? candidates.filter((c) => c.hasCurrency)
    : candidates
  const chosen = preferred[0]
  if (!chosen) return { multiple: false }
  for (const i of chosen.indices) tokens[i]!.used = true
  // "refund of 500 from Amazon" → "Refund from Amazon"
  consumePreceding(tokens, Math.min(...chosen.indices), AMOUNT_LEAD_WORDS)
  return { paise: chosen.paise, multiple: new Set(preferred.map((c) => c.paise)).size > 1 }
}

interface Mention {
  account: Account
  index: number
  preposition?: string
}

function extractAccounts(tokens: Token[], accounts: readonly Account[]): Mention[] {
  const phrases = accounts
    .filter((a) => !a.archived && !a.deletedAt)
    .flatMap((account) =>
      [...new Set([account.name.toLowerCase(), ...account.aliases])].map((p) => ({
        account,
        phrase: words(p),
      })),
    )
    // Longest first, so "hdfc bank" wins over "hdfc" and "credit card" over "card".
    .sort((a, b) => b.phrase.length - a.phrase.length)

  const mentions: Mention[] = []
  for (const { account, phrase } of phrases) {
    if (phrase.length === 0) continue
    let at = findPhrase(tokens, phrase)
    while (at !== -1) {
      markUsed(tokens, at, phrase.length)
      const after = tokens[at + phrase.length]
      if (after && !after.used && (after.lower === 'account' || after.lower === 'a/c'))
        after.used = true
      const preposition = consumePreceding(tokens, at, ACCOUNT_PREPOSITIONS)
      mentions.push({ account, index: at, ...(preposition ? { preposition } : {}) })
      at = findPhrase(tokens, phrase, at + phrase.length)
    }
  }
  return mentions.sort((a, b) => a.index - b.index)
}

function extractPaymentMethod(tokens: Token[]): PaymentMethod | undefined {
  for (const [phrase, method] of PAYMENT_PHRASES) {
    const at = findPhrase(tokens, phrase)
    if (at === -1) continue
    markUsed(tokens, at, phrase.length)
    consumePreceding(tokens, at, ACCOUNT_PREPOSITIONS)
    return method
  }
  return undefined
}

/** Best keyword match for each category type; longest phrase wins, then earliest position. */
function matchCategory(
  tokens: readonly Token[],
  categories: readonly Category[],
): Category | undefined {
  let best: { category: Category; length: number; index: number } | undefined
  for (const category of categories) {
    if (category.archived || category.deletedAt) continue
    for (const keyword of [category.name.toLowerCase(), ...category.keywords]) {
      const phrase = words(keyword)
      // Search used tokens too: "salary" can be both a type hint and a category keyword.
      const index = tokens.findIndex((_, i) => phrase.every((w, j) => tokens[i + j]?.lower === w))
      if (index === -1) continue
      if (
        !best ||
        phrase.length > best.length ||
        (phrase.length === best.length && index < best.index)
      ) {
        best = { category, length: phrase.length, index }
      }
    }
  }
  return best?.category
}

function fallbackCategory(
  categories: readonly Category[],
  type: 'expense' | 'income',
): Category | undefined {
  const active = categories.filter((c) => c.type === type && !c.archived && !c.deletedAt)
  const preferredId = type === 'expense' ? 'cat-misc' : 'cat-other-income'
  const preferredName = type === 'expense' ? 'miscellaneous' : 'other income'
  return (
    active.find((c) => c.id === preferredId) ??
    active.find((c) => c.name.toLowerCase() === preferredName) ??
    active[0]
  )
}

function consumeWords(tokens: Token[], set: ReadonlySet<string>): boolean {
  let found = false
  for (const t of tokens) {
    if (!t.used && set.has(t.lower)) {
      t.used = true
      found = true
    }
  }
  return found
}

function cleanDescription(tokens: readonly Token[]): string {
  const rest = tokens.filter((t) => !t.used)
  while (rest.length > 0 && FILLERS.has(rest[0]!.lower)) rest.shift()
  while (rest.length > 0 && FILLERS.has(rest.at(-1)!.lower)) rest.pop()
  const text = rest
    .map((t) => t.text)
    .join(' ')
    .slice(0, 200)
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''
}

/**
 * Turns a sentence like "Spent 350 on lunch using HDFC yesterday" into a transaction.
 * Deterministic, offline, and driven by the user's own category keywords and account aliases.
 */
export function parseEntry(text: string, ctx: ParseContext): ParseResult {
  const tokens = tokenize(text)
  const issues: ParseIssue[] = []

  const date = extractDate(tokens, ctx.today) ?? ctx.today
  const amount = extractAmount(tokens)
  if (amount.paise === undefined || amount.paise === 0) issues.push('no-amount')
  if (amount.multiple) issues.push('multiple-amounts')

  // Before verbs, so the "pay" in "Google Pay" isn't read as "paid".
  const paymentMethod = extractPaymentMethod(tokens)

  const isWithdrawal = consumeWords(tokens, WITHDRAW_WORDS)
  const saysTransfer = consumeWords(tokens, TRANSFER_WORDS) || isWithdrawal
  const strongIncome =
    consumeWords(tokens, INCOME_WORDS) || tokens.some((t) => INCOME_HINTS.has(t.lower))
  const weakIncome = consumeWords(tokens, WEAK_INCOME_WORDS)
  const saysExpense = consumeWords(tokens, EXPENSE_WORDS)

  const mentions = extractAccounts(tokens, ctx.accounts)
  const keywordCategory = matchCategory(tokens, ctx.categories)
  const saysIncome =
    strongIncome || (weakIncome && !saysExpense && keywordCategory?.type !== 'expense')
  const defaultAccount = pickDefaultAccount(ctx.accounts)

  // Paying a credit card bill moves money to the card; it isn't spending.
  const cardMention = mentions.find((m) => m.account.type === 'credit_card')
  const isCardBill =
    !saysIncome &&
    cardMention !== undefined &&
    tokens.some((t) => t.lower === 'bill' || t.lower === 'payment')

  let type: TransactionType
  if (saysTransfer || isCardBill) type = 'transfer'
  else if (saysIncome && !saysExpense) type = 'income'
  else if (saysExpense) type = 'expense'
  // No verb: let the category decide ("salary 85000" is income, "lunch 350" an expense).
  else type = keywordCategory?.type === 'income' ? 'income' : 'expense'

  const result: ParseResult = { type, description: '', date, issues, input: null }
  if (amount.paise) result.amount = amount.paise
  if (paymentMethod) result.paymentMethod = paymentMethod

  if (type === 'transfer') {
    const nonCard = (m: Mention) => m.account.type !== 'credit_card'
    let from: Account | undefined
    let to: Account | undefined
    if (isCardBill && !saysTransfer) {
      to = cardMention!.account
      from =
        mentions.find((m) => m !== cardMention && nonCard(m))?.account ??
        pickDefaultAccount(ctx.accounts.filter((a) => a.type !== 'credit_card'))
      for (const t of tokens) if (t.lower === 'bill' || t.lower === 'payment') t.used = true
      result.description = 'Credit card bill'
    } else {
      from = mentions.find((m) => m.preposition === 'from')?.account
      to = mentions.find(
        (m) => m.preposition && ['to', 'into', 'in'].includes(m.preposition),
      )?.account
      const unassigned = mentions
        .filter((m) => m.account !== from && m.account !== to)
        .map((m) => m.account)
      if (isWithdrawal) {
        to ??=
          unassigned.find((a) => a.type === 'cash') ??
          ctx.accounts.find((a) => a.type === 'cash' && !a.archived)
        from ??= unassigned.find((a) => a !== to && a.type !== 'cash') ?? defaultAccount
      } else {
        from ??= unassigned.shift() ?? (to ? defaultAccount : undefined)
        to ??= unassigned.find((a) => a !== from)
      }
      if (isWithdrawal && !cleanDescription(tokens)) result.description = 'Cash withdrawal'
    }
    if (from) result.accountId = from.id
    if (to) result.toAccountId = to.id
    if (!from || !to || from.id === to.id) issues.push('transfer-accounts')
  } else {
    const matched = matchCategory(
      tokens,
      ctx.categories.filter((c) => c.type === type),
    )
    if (!matched) issues.push('category-guessed')
    const category = matched ?? fallbackCategory(ctx.categories, type)
    if (category) result.categoryId = category.id
    const account = mentions[0]?.account ?? defaultAccount
    if (account) result.accountId = account.id
  }

  result.description ||= cleanDescription(tokens)

  if (!issues.includes('no-amount') && !issues.includes('transfer-accounts')) {
    const parsed = transactionInputSchema.safeParse({
      type: result.type,
      amount: result.amount,
      description: result.description,
      categoryId: result.categoryId,
      accountId: result.accountId,
      toAccountId: result.toAccountId,
      date: result.date,
      paymentMethod: result.paymentMethod,
    })
    if (parsed.success) result.input = parsed.data
    else issues.push('invalid')
  }
  return result
}

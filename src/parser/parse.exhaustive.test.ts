import { describe, expect, it } from 'vitest'
import { SEED_ACCOUNTS, SEED_CATEGORIES } from '../data/seed'
import { transactionInputSchema, type Account, type Category } from '../domain/types'
import { extractDate } from './dates'
import { parseEntry, type ParseContext, type ParseResult } from './parse'
import { consumePreceding, findPhrase, markUsed, tokenize } from './tokens'

const STAMP = '2026-11-01T00:00:00.000Z'
const categories: Category[] = SEED_CATEGORIES.map((c) => ({
  ...c,
  archived: false,
  createdAt: STAMP,
  updatedAt: STAMP,
}))
const accounts: Account[] = SEED_ACCOUNTS.map((a) => ({
  ...a,
  openingBalance: 0,
  currency: 'INR',
  archived: false,
  createdAt: STAMP,
  updatedAt: STAMP,
}))

// Monday 2 November 2026
const TODAY = '2026-11-02'
const ctx: ParseContext = { categories, accounts, today: TODAY }
const parse = (text: string, over: Partial<ParseContext> = {}) =>
  parseEntry(text, { ...ctx, ...over })
const withAccounts = (list: Account[]) => ({ accounts: list })
const withCategories = (list: Category[]) => ({ categories: list })

const amountOf = (text: string) => parse(text).amount
const dateOf = (text: string, today = TODAY) => parse(text, { today }).date
const catName = (r: ParseResult) => categories.find((c) => c.id === r.categoryId)?.name
const acctName = (id: string | undefined) => accounts.find((a) => a.id === id)?.name

// ---------------------------------------------------------------------------------------------
describe('tokenizer', () => {
  const texts = (s: string) => tokenize(s).map((t) => t.text)

  it('splits on any whitespace and drops empties', () => {
    expect(texts('  spent \t 350\n on   lunch ')).toEqual(['spent', '350', 'on', 'lunch'])
    expect(tokenize('')).toEqual([])
    expect(tokenize('   \n\t ')).toEqual([])
  })

  it('removes thousands separators, Indian and Western', () => {
    expect(texts('1,200')).toEqual(['1200'])
    expect(texts('1,00,000')).toEqual(['100000'])
    expect(texts('12,34,567.50')).toEqual(['1234567.50'])
  })

  it('does not merge list commas that are not inside a number', () => {
    expect(texts('milk, bread')).toEqual(['milk', 'bread'])
  })

  it.each([
    ['₹350', ['rs', '350']],
    ['₹ 350', ['rs', '350']],
    ['Rs.350', ['rs', '350']],
    ['rs350', ['rs', '350']],
    ['350rs', ['350', 'rs']],
    ['350INR', ['350', 'INR']],
    ['350rupees', ['350', 'rupees']],
    ['350 rupee', ['350', 'rupee']],
  ])('normalises currency spelling %s', (input, expected) => {
    expect(texts(input)).toEqual(expected)
  })

  it('strips surrounding punctuation and quotes', () => {
    expect(texts('“Lunch”, (cafe).')).toEqual(['Lunch', 'cafe'])
    expect(texts('lunch!!! really?')).toEqual(['lunch', 'really'])
    expect(texts("'quoted' text;")).toEqual(['quoted', 'text'])
  })

  it('keeps original spelling and a lowercase copy', () => {
    const [t] = tokenize('HDFC')
    expect(t).toEqual({ text: 'HDFC', lower: 'hdfc', used: false })
  })

  it('findPhrase finds multi-word phrases, skips used tokens and honours `from`', () => {
    const tokens = tokenize('pay with google pay then google pay')
    expect(findPhrase(tokens, ['google', 'pay'])).toBe(2)
    expect(findPhrase(tokens, ['google', 'pay'], 3)).toBe(5)
    markUsed(tokens, 2, 2)
    expect(findPhrase(tokens, ['google', 'pay'])).toBe(5)
    expect(findPhrase(tokens, ['nothing'])).toBe(-1)
    expect(findPhrase(tokens, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])).toBe(-1)
  })

  it('consumePreceding only takes an unused word from the set', () => {
    const tokens = tokenize('using hdfc')
    expect(consumePreceding(tokens, 1, new Set(['with']))).toBeUndefined()
    expect(consumePreceding(tokens, 1, new Set(['using']))).toBe('using')
    expect(tokens[0]!.used).toBe(true)
    expect(consumePreceding(tokens, 1, new Set(['using']))).toBeUndefined()
    expect(consumePreceding(tokens, 0, new Set(['using']))).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------------------------
describe('amounts', () => {
  it.each([
    ['spent 100 on lunch', 100_00],
    ['spent 100rs on lunch', 100_00],
    ['spent 100 rs on lunch', 100_00],
    ['spent Rs 100 on lunch', 100_00],
    ['spent Rs. 100 on lunch', 100_00],
    ['spent Rs.100 on lunch', 100_00],
    ['spent rs100 on lunch', 100_00],
    ['spent ₹100 on lunch', 100_00],
    ['spent ₹ 100 on lunch', 100_00],
    ['spent 100 rupees on lunch', 100_00],
    ['spent 100 rupee on lunch', 100_00],
    ['spent 100 INR on lunch', 100_00],
    ['spent INR 100 on lunch', 100_00],
    ['spent 100 bucks on lunch', 100_00],
    ['spent 99.50 on lunch', 99_50],
    ['spent 99.5 on lunch', 99_50],
    ['spent ₹99.99 on lunch', 99_99],
    ['spent 0.50 on lunch', 50],
    ['spent 1,200 on lunch', 1200_00],
    ['spent ₹1,200.75 on lunch', 1200_75],
    ['spent 1,00,000 on lunch', 100000_00],
    ['spent 12,34,567 on lunch', 1234567_00],
    ['spent 2k on lunch', 2000_00],
    ['spent 1.5k on lunch', 1500_00],
    ['spent 2 thousand on lunch', 2000_00],
    ['spent 1 lakh on lunch', 100000_00],
    ['spent 2.5 lakh on lunch', 250000_00],
    ['spent 3 lakhs on lunch', 300000_00],
    ['spent 1 lac on lunch', 100000_00],
    ['spent 2 lacs on lunch', 200000_00],
    ['spent 10 lakh rupees on lunch', 1000000_00],
    ['spent ₹2k on lunch', 2000_00],
    ['lunch 350', 350_00],
    ['350 lunch', 350_00],
    ['350', 350_00],
    ['spent 350.', 350_00],
    ['SPENT 350 ON LUNCH', 350_00],
    ['spent   350    on  lunch', 350_00],
    ['spent 350, on lunch', 350_00],
  ])('%s', (text, expected) => {
    expect(amountOf(text)).toBe(expected)
  })

  it.each([
    ['spent hundred rupees on lunch'],
    ['spent a lot on lunch'],
    ['lunch'],
    [''],
    ['   '],
    ['spent 0 on lunch'],
    ['spent 0.00 on lunch'],
  ])('flags no amount for %j', (text) => {
    const r = parse(text)
    expect(r.issues).toContain('no-amount')
    expect(r.input).toBeNull()
    expect(r.amount === undefined || r.amount === 0).toBe(true)
  })

  it('prefers the number marked as currency', () => {
    const r = parse('bought 2 tickets for rs 500')
    expect(r.amount).toBe(500_00)
    expect(r.issues).not.toContain('multiple-amounts')
  })

  it('prefers a currency mark before or after the number', () => {
    expect(amountOf('3 coffees ₹360')).toBe(360_00)
    expect(amountOf('3 coffees 360 rs')).toBe(360_00)
  })

  it('flags several different amounts and uses the first', () => {
    const r = parse('spent 100 and 200 on lunch')
    expect(r.amount).toBe(100_00)
    expect(r.issues).toContain('multiple-amounts')
  })

  it('does not flag the same amount mentioned twice', () => {
    expect(parse('spent 100 on lunch 100').issues).not.toContain('multiple-amounts')
  })

  it('flags several currency-marked amounts', () => {
    expect(parse('spent rs 100 and rs 200 on lunch').issues).toContain('multiple-amounts')
  })

  it('removes the lead word before the amount from the description', () => {
    expect(parse('refund of 500 from Amazon').description).toBe('Refund from Amazon')
    expect(parse('paid for 500 groceries').description).toBe('Groceries')
    expect(parse('items worth 500').description).toBe('Items')
  })

  it('treats digits glued to letters as words, not amounts', () => {
    expect(amountOf('bought a 5g plan')).toBeUndefined()
    expect(amountOf('bought a 5g plan for 299')).toBe(299_00)
  })

  it('does not read three-decimal numbers as money', () => {
    expect(amountOf('spent 99.999 on lunch')).toBeUndefined()
  })

  it('handles huge amounts without losing precision', () => {
    expect(amountOf('spent 99999999 on lunch')).toBe(99_999_999_00)
  })

  it('keeps the amount out of the description', () => {
    expect(parse('spent 350 rupees on lunch').description).toBe('Lunch')
  })
})

// ---------------------------------------------------------------------------------------------
describe('dates', () => {
  it.each([
    ['today', '2026-11-02'],
    ['tonight', '2026-11-02'],
    ['yesterday', '2026-11-01'],
    ['day before yesterday', '2026-10-31'],
    ['1 day ago', '2026-11-01'],
    ['2 days ago', '2026-10-31'],
    ['3 days ago', '2026-10-30'],
    ['30 days ago', '2026-10-03'],
    ['100 days ago', '2026-07-25'],
  ])('relative: %s', (phrase, expected) => {
    expect(dateOf(`spent 100 on lunch ${phrase}`)).toBe(expected)
  })

  it.each([
    ['on friday', '2026-10-30'],
    ['on monday', '2026-11-02'],
    ['last monday', '2026-10-26'],
    ['last friday', '2026-10-30'],
    ['last sunday', '2026-11-01'],
    ['friday', '2026-10-30'],
    ['monday', '2026-11-02'],
    ['on fri', '2026-10-30'],
    ['last fri', '2026-10-30'],
    ['on thurs', '2026-10-29'],
    ['on tue', '2026-10-27'],
    ['on wed', '2026-10-28'],
    ['on sat', '2026-10-31'],
    ['on sun', '2026-11-01'],
  ])('weekdays (today is Monday 2 Nov): %s', (phrase, expected) => {
    expect(dateOf(`spent 100 on lunch ${phrase}`)).toBe(expected)
  })

  it('leaves an abbreviated weekday with no lead word alone', () => {
    // "sat" and "sun" are also ordinary words; only full names work bare.
    const r = parse('spent 100 on lunch sat')
    expect(r.date).toBe(TODAY)
    expect(r.description).toBe('Lunch sat')
  })

  it.each([
    ['28 october', '2026-10-28'],
    ['28 oct', '2026-10-28'],
    ['28th october', '2026-10-28'],
    ['october 28', '2026-10-28'],
    ['oct 28th', '2026-10-28'],
    ['28 of october', '2026-10-28'],
    ['on 28 october', '2026-10-28'],
    ['on the 28th of october', '2026-10-28'],
    ['1st november', '2026-11-01'],
    ['2 nov', '2026-11-02'],
    ['2nd nov', '2026-11-02'],
    ['15 sept', '2026-09-15'],
    ['15 sep', '2026-09-15'],
    ['1 jan', '2026-01-01'],
    ['31 dec', '2025-12-31'],
  ])('named dates: %s', (phrase, expected) => {
    expect(dateOf(`spent 100 on lunch ${phrase}`)).toBe(expected)
  })

  it('a named date later this year means last year', () => {
    expect(dateOf('spent 100 on lunch 5th november')).toBe('2025-11-05')
    expect(dateOf('spent 100 on lunch 25 december')).toBe('2025-12-25')
  })

  it.each([
    ['15/10', '2026-10-15'],
    ['15-10', '2026-10-15'],
    ['5/11', '2025-11-05'],
    ['15/10/2026', '2026-10-15'],
    ['15/10/26', '2026-10-15'],
    ['15-10-2026', '2026-10-15'],
    ['01/11/2026', '2026-11-01'],
    ['29/02/2028', '2028-02-29'],
  ])('numeric dates are day first: %s', (phrase, expected) => {
    expect(dateOf(`spent 100 on lunch ${phrase}`)).toBe(expected)
  })

  it.each([['31/04'], ['31/04/2026'], ['30/02/2026'], ['0/5'], ['15/13'], ['29/02/2027']])(
    'ignores impossible dates: %s',
    (phrase) => {
      expect(dateOf(`spent 100 on lunch ${phrase}`)).toBe(TODAY)
    },
  )

  it('does not accept 29 February in a non-leap year, but does in a leap year', () => {
    expect(dateOf('spent 100 on lunch 29 feb', '2028-03-01')).toBe('2028-02-29')
    expect(dateOf('spent 100 on lunch 29 feb', '2026-11-02')).toBe(TODAY)
  })

  it.each([
    ['on the 1st', '2026-11-01'],
    ['on the 2nd', '2026-11-02'],
    ['on the 3rd', '2026-10-03'],
    ['on the 30th', '2026-10-30'],
    ['on 30th', '2026-10-30'],
    ['on the 5th', '2026-10-05'],
  ])('day of month only: %s', (phrase, expected) => {
    expect(dateOf(`spent 100 on lunch ${phrase}`)).toBe(expected)
  })

  it('a bare "on 500" stays an amount, not a day', () => {
    const r = parse('spent on 500')
    expect(r.amount).toBe(500_00)
    expect(r.date).toBe(TODAY)
  })

  it('a bare day number without "on the" or an ordinal is not a date', () => {
    const r = parse('spent 5 on lunch')
    expect(r.amount).toBe(5_00)
    expect(r.date).toBe(TODAY)
  })

  it('handles the start of a year', () => {
    expect(dateOf('spent 100 on lunch 28 december', '2026-01-03')).toBe('2025-12-28')
    expect(dateOf('spent 100 on lunch on the 30th', '2026-01-03')).toBe('2025-12-30')
    expect(dateOf('spent 100 on lunch yesterday', '2026-01-01')).toBe('2025-12-31')
  })

  it('handles the end of February and month lengths', () => {
    expect(dateOf('spent 100 on lunch yesterday', '2026-03-01')).toBe('2026-02-28')
    expect(dateOf('spent 100 on lunch yesterday', '2028-03-01')).toBe('2028-02-29')
    expect(dateOf('spent 100 on lunch on the 31st', '2026-03-05')).toBe('2026-01-31')
  })

  it('skips months that do not have that day', () => {
    // 31st asked for on 30 March: February has no 31st, so it is 31 January.
    expect(dateOf('spent 100 on lunch on the 31st', '2026-03-30')).toBe('2026-01-31')
    expect(dateOf('spent 100 on lunch on the 30th', '2026-03-05')).toBe('2026-01-30')
  })

  it('takes only the first date expression', () => {
    expect(dateOf('spent 100 on lunch yesterday or 3 days ago')).toBe('2026-11-01')
  })

  it('keeps date words out of the description', () => {
    expect(parse('spent 100 on lunch yesterday').description).toBe('Lunch')
    expect(parse('spent 100 on lunch on the 28th of october').description).toBe('Lunch')
    expect(parse('spent 100 on lunch last friday').description).toBe('Lunch')
  })

  it('a date can come first', () => {
    const r = parse('yesterday spent 100 on lunch')
    expect(r.date).toBe('2026-11-01')
    expect(r.amount).toBe(100_00)
  })

  it('a date does not eat the amount', () => {
    const r = parse('spent 500 on 5 november')
    expect(r.amount).toBe(500_00)
    expect(r.date).toBe('2025-11-05')
  })

  it('extractDate works on tokens directly and returns null when there is none', () => {
    expect(extractDate(tokenize('spent 100 on lunch'), TODAY)).toBeNull()
    expect(extractDate(tokenize('spent yesterday'), TODAY)).toBe('2026-11-01')
  })
})

// ---------------------------------------------------------------------------------------------
describe('transaction type', () => {
  it.each(['spent', 'spend', 'paid', 'pay', 'bought', 'buy', 'purchased', 'cost', 'costs'])(
    'expense verb: %s',
    (verb) => {
      expect(parse(`${verb} 100 on lunch`).type).toBe('expense')
    },
  )

  it.each(['received', 'receive', 'earned', 'earn', 'credited'])('income verb: %s', (verb) => {
    const r = parse(`${verb} 5000 from freelance`)
    expect(r.type).toBe('income')
    expect(r.input).not.toBeNull()
  })

  it.each(['salary', 'refund', 'refunded', 'cashback', 'income', 'dividend'])(
    'income hint without a verb: %s',
    (hint) => {
      expect(parse(`${hint} 5000`).type).toBe('income')
    },
  )

  it('"got" is income when nothing points to spending', () => {
    expect(parse('got 500').type).toBe('income')
    expect(parse('got 500 cashback').type).toBe('income')
  })

  it('"got" is spending when the words point to spending', () => {
    expect(parse('got groceries for 500').type).toBe('expense')
    expect(parse('got 500 of petrol').type).toBe('expense')
    expect(parse('got lunch spent 100').type).toBe('expense')
  })

  it('no verb: the category decides', () => {
    expect(parse('lunch 350').type).toBe('expense')
    expect(parse('salary 85000').type).toBe('income')
    expect(parse('350').type).toBe('expense')
  })

  it('a strong income word beats an expense word', () => {
    // "paid" appears, but the money came in.
    expect(parse('received 500 paid back by Rohan').type).toBe('income')
  })

  it.each(['Rohan paid me back 500', 'Meera paid me 1600 for dinner', 'paid me back 250 by gpay'])(
    '"paid me" means money came in: %s',
    (text) => {
      const r = parse(text)
      expect(r.type).toBe('income')
      expect(r.input).not.toBeNull()
    },
  )

  it('"paid" without "me" is still spending', () => {
    expect(parse('paid meera 500 for dinner').type).toBe('expense')
  })

  it('an income hint plus an expense verb is an expense', () => {
    expect(parse('paid 500 salary advance').type).toBe('expense')
  })

  it('recognises verbs in any case', () => {
    expect(parse('RECEIVED 500 SALARY').type).toBe('income')
    expect(parse('SpEnT 500').type).toBe('expense')
  })

  it('keeps the verb out of the description', () => {
    expect(parse('spent 100 on lunch').description).toBe('Lunch')
    expect(parse('received 5000 from freelance work').description).toBe('Freelance work')
  })
})

// ---------------------------------------------------------------------------------------------
describe('categories', () => {
  const expenseCats = categories.filter((c) => c.type === 'expense')
  const incomeCats = categories.filter((c) => c.type === 'income')

  // Every default keyword must map to its own category, unless another category shares it.
  const owners = new Map<string, Set<string>>()
  for (const c of categories) {
    for (const k of [c.name.toLowerCase(), ...c.keywords]) {
      if (!owners.has(k)) owners.set(k, new Set())
      owners.get(k)!.add(c.id)
    }
  }
  const unique = (c: Category) =>
    [c.name.toLowerCase(), ...c.keywords].filter((k) => owners.get(k)!.size === 1)

  it.each(expenseCats.flatMap((c) => unique(c).map((k) => [k, c.name] as const)))(
    'expense keyword "%s" → %s',
    (keyword, name) => {
      const r = parse(`spent 100 on ${keyword}`)
      expect(catName(r)).toBe(name)
      expect(r.issues).toEqual([])
      expect(r.type).toBe('expense')
    },
  )

  it.each(incomeCats.flatMap((c) => unique(c).map((k) => [k, c.name] as const)))(
    'income keyword "%s" → %s',
    (keyword, name) => {
      const r = parse(`received 100 ${keyword}`)
      expect(catName(r)).toBe(name)
      expect(r.type).toBe('income')
    },
  )

  it('falls back to Miscellaneous and flags it', () => {
    const r = parse('spent 100 on xylophone')
    expect(catName(r)).toBe('Miscellaneous')
    expect(r.issues).toContain('category-guessed')
    expect(r.input).not.toBeNull()
  })

  it('falls back to Other Income for income', () => {
    const r = parse('received 100 from xylophone')
    expect(catName(r)).toBe('Other Income')
    expect(r.issues).toContain('category-guessed')
  })

  it('matches keywords in any case', () => {
    expect(catName(parse('SPENT 100 ON SWIGGY'))).toBe('Food & Dining')
  })

  it('only matches whole words', () => {
    expect(catName(parse('spent 100 on autograph'))).toBe('Miscellaneous') // not "auto"
    expect(catName(parse('spent 100 on busy day'))).toBe('Miscellaneous') // not "bus"
  })

  it('the longest phrase wins, then the earliest', () => {
    const custom: Category[] = [
      cat('c1', 'Coffee', ['coffee']),
      cat('c2', 'Office', ['office coffee machine']),
      cat('c3', 'Tea', ['tea']),
    ]
    expect(parse('spent 100 on office coffee machine', withCategories(custom)).categoryId).toBe(
      'c2',
    )
    expect(parse('spent 100 on tea coffee', withCategories(custom)).categoryId).toBe('c3')
    expect(parse('spent 100 on coffee tea', withCategories(custom)).categoryId).toBe('c1')
  })

  it('uses the category name itself as a keyword', () => {
    expect(catName(parse('spent 100 on groceries'))).toBe('Groceries')
    expect(catName(parse('spent 100 on fitness'))).toBe('Fitness')
  })

  it('matches multi-word keywords', () => {
    const custom = [cat('c1', 'Pets', ['dog food', 'vet visit'])]
    expect(parse('spent 100 on dog food', withCategories(custom)).categoryId).toBe('c1')
    expect(parse('spent 100 on vet visit', withCategories(custom)).categoryId).toBe('c1')
    expect(parse('spent 100 on dog', withCategories(custom)).issues).toContain('category-guessed')
  })

  it('never picks a category of the wrong type', () => {
    // "salary" is an income keyword; as an expense it must not become Salary.
    const r = parse('paid 500 salary advance')
    expect(r.type).toBe('expense')
    expect(categories.find((c) => c.id === r.categoryId)?.type).toBe('expense')
  })

  it('ignores archived and deleted categories', () => {
    const custom: Category[] = [
      cat('c1', 'Food', ['lunch'], { archived: true }),
      cat('c2', 'Dining', ['lunch'], { deletedAt: STAMP }),
      cat('c3', 'Miscellaneous', [], { id: 'cat-misc' }),
    ]
    const r = parse('spent 100 on lunch', withCategories(custom))
    expect(r.categoryId).toBe('cat-misc')
    expect(r.issues).toContain('category-guessed')
  })

  it('has no category when the user has none, and says so', () => {
    const r = parse('spent 100 on lunch', withCategories([]))
    expect(r.categoryId).toBeUndefined()
    expect(r.input).toBeNull()
    expect(r.issues).toContain('invalid')
  })

  it('keeps the matched keyword in the description', () => {
    expect(parse('spent 100 on swiggy').description).toBe('Swiggy')
  })
})

// ---------------------------------------------------------------------------------------------
describe('accounts and payment methods', () => {
  it.each([
    ['hdfc', 'HDFC Bank'],
    ['hdfc bank', 'HDFC Bank'],
    ['HDFC', 'HDFC Bank'],
    ['cash', 'Cash'],
    ['other bank', 'Other Bank'],
    ['credit card', 'Credit Card'],
    ['card', 'Credit Card'],
  ])('alias "%s" → %s', (alias, name) => {
    const r = parse(`spent 100 on lunch using ${alias}`)
    expect(acctName(r.accountId)).toBe(name)
    expect(r.description).toBe('Lunch')
  })

  it.each(['using', 'with', 'via', 'from', 'in', 'on', 'by', 'through', 'thru', 'frm'])(
    'preposition "%s" before the account is dropped from the description',
    (prep) => {
      const r = parse(`spent 100 on lunch ${prep} cash`)
      expect(acctName(r.accountId)).toBe('Cash')
      expect(r.description).toBe('Lunch')
    },
  )

  it('drops the word "account" or "a/c" after an account name', () => {
    expect(parse('spent 100 on lunch using hdfc account').description).toBe('Lunch')
    expect(parse('spent 100 on lunch using hdfc a/c').description).toBe('Lunch')
  })

  it('uses the default account when none is named', () => {
    expect(acctName(parse('spent 100 on lunch').accountId)).toBe('HDFC Bank')
  })

  it('falls back to the first active account when none is the default', () => {
    const list = accounts.map((a) => ({ ...a, isDefault: false }))
    expect(parse('spent 100 on lunch', withAccounts(list)).accountId).toBe('acc-cash')
  })

  it('longest alias wins: "hdfc bank" over "hdfc", "credit card" over "card"', () => {
    const r = parse('spent 100 using hdfc bank')
    expect(r.description).toBe('')
    expect(acctName(r.accountId)).toBe('HDFC Bank')
  })

  it('uses the first account mentioned for an expense', () => {
    expect(acctName(parse('spent 100 on lunch using cash and hdfc').accountId)).toBe('Cash')
  })

  it('works with multi-word user aliases', () => {
    const list = [
      ...accounts,
      {
        ...accounts[0]!,
        id: 'acc-sal',
        name: 'Salary Account',
        aliases: ['salary account', 'my salary bank'],
        isDefault: false,
      },
    ]
    const r = parse('spent 100 on lunch using my salary bank', withAccounts(list))
    expect(r.accountId).toBe('acc-sal')
  })

  it('ignores archived and deleted accounts', () => {
    const list = accounts.map((a) =>
      a.id === 'acc-cash'
        ? { ...a, archived: true }
        : a.id === 'acc-hdfc'
          ? { ...a, deletedAt: STAMP, isDefault: false }
          : a,
    )
    const r = parse('spent 100 on lunch using cash', withAccounts(list))
    expect(r.accountId).not.toBe('acc-cash')
    expect(r.description).toBe('Lunch using cash')
  })

  it('has no account when the user has none, and says so', () => {
    const r = parse('spent 100 on lunch', withAccounts([]))
    expect(r.accountId).toBeUndefined()
    expect(r.input).toBeNull()
    expect(r.issues).toContain('invalid')
  })

  it.each([
    ['upi', 'upi'],
    ['UPI', 'upi'],
    ['gpay', 'upi'],
    ['google pay', 'upi'],
    ['phonepe', 'upi'],
    ['phone pe', 'upi'],
    ['bhim', 'upi'],
    ['netbanking', 'netbanking'],
    ['net banking', 'netbanking'],
  ])('payment method "%s" → %s', (phrase, method) => {
    const r = parse(`spent 100 on lunch via ${phrase}`)
    expect(r.paymentMethod).toBe(method)
    expect(r.description).toBe('Lunch')
    expect(acctName(r.accountId)).toBe('HDFC Bank')
  })

  it('"Google Pay" is a payment method, not the verb "pay"', () => {
    const r = parse('got 500 cashback on google pay')
    expect(r.paymentMethod).toBe('upi')
    expect(r.type).toBe('income')
  })

  it('a card is an account, not a payment method', () => {
    const r = parse('spent 100 on lunch using card')
    expect(acctName(r.accountId)).toBe('Credit Card')
    expect(r.paymentMethod).toBeUndefined()
  })

  it('can name both an account and a payment method', () => {
    const r = parse('spent 100 on lunch using hdfc via gpay')
    expect(acctName(r.accountId)).toBe('HDFC Bank')
    expect(r.paymentMethod).toBe('upi')
    expect(r.description).toBe('Lunch')
  })
})

// ---------------------------------------------------------------------------------------------
describe('transfers', () => {
  const t = (text: string) => parse(text)

  it.each(['transferred', 'transfer', 'transferring', 'moved', 'move'])('verb: %s', (verb) => {
    const r = t(`${verb} 5000 from hdfc to cash`)
    expect(r.type).toBe('transfer')
    expect(acctName(r.accountId)).toBe('HDFC Bank')
    expect(acctName(r.toAccountId)).toBe('Cash')
    expect(r.categoryId).toBeUndefined()
    expect(r.input).not.toBeNull()
  })

  it('reads from/to in either order', () => {
    const r = t('transferred 5000 to cash from other bank')
    expect(acctName(r.accountId)).toBe('Other Bank')
    expect(acctName(r.toAccountId)).toBe('Cash')
  })

  it('"into" and "in" mark the destination', () => {
    expect(acctName(t('moved 500 from hdfc into cash').toAccountId)).toBe('Cash')
    expect(acctName(t('moved 500 from hdfc in cash').toAccountId)).toBe('Cash')
  })

  it('only the destination named: the source is the default account', () => {
    const r = t('transfer 2000 to other bank')
    expect(acctName(r.accountId)).toBe('HDFC Bank')
    expect(acctName(r.toAccountId)).toBe('Other Bank')
  })

  it('only two names with no prepositions: first is the source', () => {
    const r = t('transferred 500 hdfc cash')
    expect(acctName(r.accountId)).toBe('HDFC Bank')
    expect(acctName(r.toAccountId)).toBe('Cash')
  })

  it('flags a transfer with only a source', () => {
    const r = t('transfer 2000 from other bank')
    expect(r.issues).toContain('transfer-accounts')
    expect(r.input).toBeNull()
  })

  it('flags a transfer with no accounts', () => {
    const r = t('transferred 500')
    expect(r.issues).toContain('transfer-accounts')
    expect(r.input).toBeNull()
  })

  it('flags a transfer to the same account', () => {
    const r = t('transferred 500 from hdfc to hdfc bank')
    expect(r.issues).toContain('transfer-accounts')
    expect(r.input).toBeNull()
  })

  it.each(['withdrew', 'withdraw', 'withdrawn', 'withdrawal'])('cash withdrawal: %s', (verb) => {
    const r = t(`${verb} 2000`)
    expect(r.type).toBe('transfer')
    expect(acctName(r.accountId)).toBe('HDFC Bank')
    expect(acctName(r.toAccountId)).toBe('Cash')
    expect(r.description).toBe('Cash withdrawal')
    expect(r.input).not.toBeNull()
  })

  it('withdrawal from a named bank', () => {
    const r = t('withdrew 2000 from other bank')
    expect(acctName(r.accountId)).toBe('Other Bank')
    expect(acctName(r.toAccountId)).toBe('Cash')
  })

  it('keeps a description on a withdrawal that has one', () => {
    expect(t('withdrew 2000 for rent').description).toBe('Rent')
  })

  it('paying the credit card bill is a transfer to the card', () => {
    const r = t('paid credit card bill 5000')
    expect(r.type).toBe('transfer')
    expect(acctName(r.toAccountId)).toBe('Credit Card')
    expect(acctName(r.accountId)).toBe('HDFC Bank')
    expect(r.description).toBe('Credit card bill')
    expect(r.categoryId).toBeUndefined()
  })

  it('card bill paid from a named account', () => {
    const r = t('credit card bill payment 12000 from other bank')
    expect(r.type).toBe('transfer')
    expect(acctName(r.accountId)).toBe('Other Bank')
    expect(acctName(r.toAccountId)).toBe('Credit Card')
  })

  it('a card bill is never paid from the card itself', () => {
    const r = t('paid credit card bill 5000')
    expect(r.accountId).not.toBe(r.toAccountId)
  })

  it('spending on the card is an expense, not a bill payment', () => {
    const r = t('paid 500 for petrol using credit card')
    expect(r.type).toBe('expense')
    expect(acctName(r.accountId)).toBe('Credit Card')
  })

  it('a bill paid with the card is an expense on the card, not a card bill payment', () => {
    const r = t('paid electricity bill 1800 using credit card')
    expect(r.type).toBe('expense')
    expect(acctName(r.accountId)).toBe('Credit Card')
    expect(catName(r)).toBe('Bills & Utilities')
  })

  it.each([
    ['paid credit card bill 5000'],
    ['credit card bill 5000'],
    ['card payment 5000'],
    ['paid bill for credit card 5000'],
    ['paid the bill of my credit card 5000'],
  ])('is a card bill payment: %s', (text) => {
    const r = t(text)
    expect(r.type).toBe('transfer')
    expect(acctName(r.toAccountId)).toBe('Credit Card')
  })

  it('income words stop a card mention from becoming a bill payment', () => {
    expect(t('received 500 refund on credit card').type).toBe('income')
  })

  it('transfers never carry a category', () => {
    expect(t('moved 500 from hdfc to cash for groceries').categoryId).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------------------------
describe('descriptions', () => {
  it('capitalises the first letter and keeps the rest as spoken', () => {
    expect(parse('spent 100 on swiggy order').description).toBe('Swiggy order')
    expect(parse('spent 100 on iPhone case').description).toBe('IPhone case')
  })

  it('trims filler words at both ends only', () => {
    expect(parse('spent 100 on the lunch at the cafe').description).toBe('Lunch at the cafe')
  })

  it('is empty when nothing is left', () => {
    expect(parse('spent 100').description).toBe('')
    expect(parse('spent 100').input).not.toBeNull()
  })

  it('is cut at 200 characters', () => {
    const r = parse(`spent 100 on ${'lunch '.repeat(80)}`)
    expect(r.description.length).toBeLessThanOrEqual(200)
    expect(r.input).not.toBeNull()
  })

  it('keeps non-English words and emoji', () => {
    expect(parse('spent 100 on चाय').description).toBe('चाय')
    expect(parse('spent 100 on lunch 🍛').description).toBe('Lunch 🍛')
  })

  it('does not interpret markup or code in the text', () => {
    const r = parse('spent 100 on <script>alert(1)</script>')
    expect(r.description).toBe('<script>alert(1)</script>')
  })
})

// ---------------------------------------------------------------------------------------------
describe('realistic dictated sentences', () => {
  const cases: [
    string,
    Partial<Record<'type' | 'amount' | 'cat' | 'acct' | 'date' | 'desc', unknown>>,
  ][] = [
    [
      'spent 100rs on lunch',
      {
        type: 'expense',
        amount: 100_00,
        cat: 'Food & Dining',
        acct: 'HDFC Bank',
        date: TODAY,
        desc: 'Lunch',
      },
    ],
    ['Spent 350 on lunch using HDFC', { amount: 350_00, cat: 'Food & Dining', acct: 'HDFC Bank' }],
    [
      'paid ₹1,200 for petrol yesterday by card',
      { amount: 1200_00, cat: 'Fuel', acct: 'Credit Card', date: '2026-11-01', desc: 'Petrol' },
    ],
    [
      'received 50000 salary in hdfc',
      { type: 'income', amount: 50000_00, cat: 'Salary', acct: 'HDFC Bank' },
    ],
    ['Rs. 249 zomato', { type: 'expense', amount: 249_00, cat: 'Food & Dining', desc: 'Zomato' }],
    [
      'spent 100 rupees on lunch at Swiggy last friday',
      { amount: 100_00, date: '2026-10-30', desc: 'Lunch at Swiggy' },
    ],
    ['uber 180', { type: 'expense', amount: 180_00, cat: 'Transport' }],
    ['paid 450 rupees for auto', { amount: 450_00, cat: 'Transport' }],
    [
      'bought vegetables for 300 rs yesterday using cash',
      { amount: 300_00, acct: 'Cash', date: '2026-11-01' },
    ],
    [
      'netflix 649 using credit card',
      { amount: 649_00, cat: 'Subscriptions', acct: 'Credit Card' },
    ],
    ['recharged jio 299 via gpay', { amount: 299_00 }],
    ['1.5k for movie tickets on bookmyshow', { amount: 1500_00, cat: 'Entertainment' }],
    ['paid 25000 rent', { amount: 25000_00, cat: 'Rent' }],
    ['gym 1500 last monday', { amount: 1500_00, cat: 'Fitness', date: '2026-10-26' }],
    ['bought a flight to goa for 2 thousand', { amount: 2000_00, cat: 'Travel' }],
    ['spent 90 on chai and samosa', { amount: 90_00, desc: 'Chai and samosa' }],
    [
      'dinner 1,800 on the 28th of october',
      { amount: 1800_00, date: '2026-10-28', cat: 'Food & Dining' },
    ],
    ['hospital 2 lakh', { amount: 200000_00, cat: 'Health' }],
  ]
  it.each(cases)('%s', (text, expected) => {
    const r = parse(text)
    if ('type' in expected) expect(r.type).toBe(expected.type)
    if ('amount' in expected) expect(r.amount).toBe(expected.amount)
    if ('cat' in expected) expect(catName(r)).toBe(expected.cat)
    if ('acct' in expected) expect(acctName(r.accountId)).toBe(expected.acct)
    if ('date' in expected) expect(r.date).toBe(expected.date)
    if ('desc' in expected) expect(r.description).toBe(expected.desc)
  })
})

// ---------------------------------------------------------------------------------------------
describe('invariants', () => {
  const samples = [
    'spent 100 on lunch',
    'received 5000 salary',
    'transferred 5000 from hdfc to cash',
    'withdrew 2000',
    'paid credit card bill 5000',
    'lunch',
    '',
    '₹₹₹',
    '1,2,3,4',
    '0',
    'spent 100 and 200 and 300',
    'on on on on',
    'yesterday yesterday yesterday',
    'hdfc hdfc hdfc cash cash',
    '31/02 30/02 29/02',
    'a'.repeat(5000),
    '9'.repeat(40),
    '1.5k.5k 2k2k',
    'spent -100 on lunch',
    'spent 1e5 on lunch',
    '💸💸💸 100',
  ]

  it.each(samples.map((s) => [s.slice(0, 40)] as const))('is well-formed for %j', (label) => {
    const text = samples.find((s) => s.slice(0, 40) === label)!
    const r = parse(text)
    expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(r.description.length).toBeLessThanOrEqual(200)
    if (r.amount !== undefined) {
      expect(Number.isSafeInteger(r.amount)).toBe(true)
      expect(r.amount).toBeGreaterThan(0)
    }
    if (r.input) {
      // Whatever it returns as ready to save must be valid, and agree with the loose fields.
      expect(transactionInputSchema.safeParse(r.input).success).toBe(true)
      expect(r.issues).not.toContain('no-amount')
      expect(r.issues).not.toContain('transfer-accounts')
      expect(r.issues).not.toContain('invalid')
    } else {
      expect(r.issues.length).toBeGreaterThan(0)
    }
    if (r.type === 'transfer') {
      expect(r.categoryId).toBeUndefined()
    } else {
      expect(r.toAccountId).toBeUndefined()
    }
  })

  it('is deterministic', () => {
    for (const s of samples) expect(parse(s)).toEqual(parse(s))
  })

  it('does not change with surrounding whitespace, case or trailing punctuation', () => {
    const base = parse('spent 350 on lunch using hdfc yesterday')
    for (const variant of [
      '  spent 350 on lunch using hdfc yesterday  ',
      'SPENT 350 ON LUNCH USING HDFC YESTERDAY',
      'spent 350 on lunch using hdfc yesterday.',
      'Spent 350 on lunch, using HDFC, yesterday!',
    ]) {
      const r = parse(variant)
      expect(r.input).toMatchObject({
        type: base.type,
        amount: base.amount,
        categoryId: base.categoryId,
        accountId: base.accountId,
        date: base.date,
      })
    }
  })

  it('never throws on random text', () => {
    let seed = 12345
    const rand = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
      return seed / 4294967296
    }
    const vocab = [
      'spent',
      'paid',
      'received',
      'got',
      'transferred',
      'withdrew',
      'from',
      'to',
      'on',
      'using',
      'hdfc',
      'cash',
      'card',
      'credit',
      'bill',
      'upi',
      'gpay',
      'lunch',
      'salary',
      'yesterday',
      'friday',
      '5th',
      'november',
      'oct',
      '15/10',
      '₹',
      'rs',
      'k',
      'lakh',
      '100',
      '2.5',
      '0',
      '1,200',
      'account',
      'a/c',
      'of',
      'for',
      '',
      '!',
      '?',
      '(',
      ')',
      '"',
      '’',
      '🍛',
    ]
    for (let i = 0; i < 2000; i++) {
      const length = Math.floor(rand() * 12)
      const text = Array.from({ length }, () => vocab[Math.floor(rand() * vocab.length)]).join(' ')
      const r = parse(text)
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      if (r.input) expect(transactionInputSchema.safeParse(r.input).success).toBe(true)
    }
  })

  it('every date it returns is a real calendar day on or before today', () => {
    const phrases = [
      'yesterday',
      '2 days ago',
      'last friday',
      'on the 31st',
      '29 feb',
      '31 apr',
      'on the 30th',
      '5/11',
      '31/12',
      '1/1',
      'dec 31',
      'feb 29',
    ]
    for (const today of ['2026-01-01', '2026-03-31', '2026-03-01', '2028-02-29', '2026-12-31']) {
      for (const p of phrases) {
        const { date } = parse(`spent 100 on lunch ${p}`, { today })
        const parsed = new Date(`${date}T00:00:00Z`)
        expect(parsed.toISOString().slice(0, 10)).toBe(date)
        expect(date <= today).toBe(true)
      }
    }
  })
})

function cat(id: string, name: string, keywords: string[], over: Partial<Category> = {}): Category {
  return {
    id,
    name,
    type: 'expense',
    icon: '🏷️',
    color: '#888888',
    keywords,
    archived: false,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...over,
  }
}

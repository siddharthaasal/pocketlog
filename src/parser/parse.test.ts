import { describe, expect, it } from 'vitest'
import { SEED_ACCOUNTS, SEED_CATEGORIES } from '../data/seed'
import type { Account, Category } from '../domain/types'
import { parseEntry, type ParseContext } from './parse'

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
const ctx: ParseContext = { categories, accounts, today: '2026-11-02' }
const parse = (text: string) => parseEntry(text, ctx)

describe('examples from the plan', () => {
  it('Spent 350 rupees on lunch using HDFC', () => {
    const r = parse('Spent 350 rupees on lunch using HDFC')
    expect(r.input).toEqual({
      type: 'expense',
      amount: 350_00,
      description: 'Lunch',
      categoryId: 'cat-food',
      accountId: 'acc-hdfc',
      date: '2026-11-02',
    })
    expect(r.issues).toEqual([])
  })

  it('Spent 350 on lunch (default account)', () => {
    expect(parse('Spent 350 on lunch').input).toMatchObject({
      amount: 350_00,
      description: 'Lunch',
      categoryId: 'cat-food',
      accountId: 'acc-hdfc',
    })
  })

  it('Paid 1200 for petrol using HDFC', () => {
    expect(parse('Paid 1200 for petrol using HDFC').input).toMatchObject({
      type: 'expense',
      amount: 1200_00,
      description: 'Petrol',
      categoryId: 'cat-fuel',
      accountId: 'acc-hdfc',
    })
  })

  it('Bought groceries for 850 yesterday', () => {
    expect(parse('Bought groceries for 850 yesterday').input).toMatchObject({
      amount: 850_00,
      description: 'Groceries',
      categoryId: 'cat-groceries',
      date: '2026-11-01',
    })
  })

  it('Received 5000 from freelance work', () => {
    expect(parse('Received 5000 from freelance work').input).toMatchObject({
      type: 'income',
      amount: 5000_00,
      description: 'Freelance work',
      categoryId: 'cat-freelance',
      accountId: 'acc-hdfc',
    })
  })

  it('Transferred 10000 from HDFC to cash', () => {
    const r = parse('Transferred 10000 from HDFC to cash')
    expect(r.input).toMatchObject({
      type: 'transfer',
      amount: 10000_00,
      accountId: 'acc-hdfc',
      toAccountId: 'acc-cash',
    })
    expect(r.input?.categoryId).toBeUndefined()
  })
})

describe('amounts', () => {
  it.each([
    ['Spent ₹350 on lunch', 350_00],
    ['Spent Rs. 1,200 on dinner', 1200_00],
    ['spent rs350 on snacks', 350_00],
    ['Spent 99.50 on coffee', 99_50],
    ['Paid 1.5k for the gym', 1500_00],
    ['Paid 2 thousand for rent', 2000_00],
    ['Received 1 lakh salary', 100000_00],
    ['Lunch 250', 250_00],
  ])('%s', (text, paise) => {
    expect(parse(text).amount).toBe(paise)
  })

  it('flags a missing amount and returns no transaction', () => {
    const r = parse('Spent money on lunch')
    expect(r.issues).toContain('no-amount')
    expect(r.input).toBeNull()
  })

  it('prefers the amount marked as currency when there are several numbers', () => {
    const r = parse('Bought 2 shirts for 1500 rupees')
    expect(r.amount).toBe(1500_00)
    expect(r.issues).not.toContain('multiple-amounts')
  })

  it('flags ambiguous amounts', () => {
    expect(parse('Paid 200 and 300 for snacks').issues).toContain('multiple-amounts')
  })
})

describe('dates', () => {
  it.each([
    ['Spent 100 on tea today', '2026-11-02'],
    ['Spent 100 on tea yesterday', '2026-11-01'],
    ['Spent 100 on tea day before yesterday', '2026-10-31'],
    ['Spent 100 on tea 3 days ago', '2026-10-30'],
    ['Spent 100 on tea on Saturday', '2026-10-31'],
    ['Spent 100 on tea last Monday', '2026-10-26'],
    ['Spent 100 on tea on Monday', '2026-11-02'],
    ['Spent 100 on tea on the 1st', '2026-11-01'],
    ['Spent 100 on tea on 5th', '2026-10-05'],
    ['Spent 100 on tea on 28 October', '2026-10-28'],
    ['Spent 100 on tea on Oct 28th', '2026-10-28'],
    ['Spent 100 on tea on 25 December', '2025-12-25'],
    ['Spent 100 on tea on 15/10', '2026-10-15'],
  ])('%s', (text, date) => {
    const r = parse(text)
    expect(r.date).toBe(date)
    expect(r.amount).toBe(100_00)
    expect(r.description).toBe('Tea')
  })
})

describe('accounts and payment methods', () => {
  it('matches aliases, longest first', () => {
    expect(parse('Paid 500 for shoes with credit card').accountId).toBe('acc-credit-card')
    expect(parse('Spent 60 on chai in cash').accountId).toBe('acc-cash')
    expect(parse('Spent 200 on lunch from HDFC bank account').accountId).toBe('acc-hdfc')
  })

  it('records UPI as a payment method, not an account', () => {
    const r = parse('Paid 120 for auto via UPI')
    expect(r.input).toMatchObject({
      paymentMethod: 'upi',
      accountId: 'acc-hdfc',
      categoryId: 'cat-transport',
    })
    expect(r.description).toBe('Auto')
  })

  it('understands GPay and Google Pay', () => {
    expect(parse('Paid 80 for coffee on gpay').paymentMethod).toBe('upi')
    expect(parse('Paid 80 for coffee using google pay').paymentMethod).toBe('upi')
  })
})

describe('types and categories', () => {
  it('treats income words and hints as income', () => {
    expect(parse('Salary credited 85000').input).toMatchObject({
      type: 'income',
      categoryId: 'cat-salary',
    })
    expect(parse('Got a refund of 499 from Amazon').input).toMatchObject({
      type: 'income',
      categoryId: 'cat-refunds',
      description: 'Refund from Amazon',
    })
  })

  it('treats "got" as spending when the rest points to spending', () => {
    expect(parse('Got groceries for 640').input).toMatchObject({
      type: 'expense',
      categoryId: 'cat-groceries',
    })
  })

  it('guesses Miscellaneous and flags it when nothing matches', () => {
    const r = parse('Spent 300 on a birthday gift')
    expect(r.input).toMatchObject({ categoryId: 'cat-misc', description: 'Birthday gift' })
    expect(r.issues).toEqual(['category-guessed'])
  })

  it('uses keywords like merchant names', () => {
    expect(parse('Swiggy 450').input).toMatchObject({
      categoryId: 'cat-food',
      description: 'Swiggy',
    })
    expect(parse('Uber to office 230').input).toMatchObject({ categoryId: 'cat-transport' })
  })
})

describe('transfers', () => {
  it('withdrawing cash moves money from the default bank to Cash', () => {
    expect(parse('Withdrew 2000').input).toMatchObject({
      type: 'transfer',
      accountId: 'acc-hdfc',
      toAccountId: 'acc-cash',
      description: 'Cash withdrawal',
    })
  })

  it('paying the credit card bill is a transfer to the card', () => {
    expect(parse('Paid credit card bill 15000').input).toMatchObject({
      type: 'transfer',
      amount: 15000_00,
      accountId: 'acc-hdfc',
      toAccountId: 'acc-credit-card',
      description: 'Credit card bill',
    })
  })

  it('assumes the default account when only the destination is named', () => {
    expect(parse('Moved 5000 to other bank').input).toMatchObject({
      accountId: 'acc-hdfc',
      toAccountId: 'acc-other-bank',
    })
  })

  it('flags a transfer with no accounts', () => {
    const r = parse('Transferred 500')
    expect(r.issues).toContain('transfer-accounts')
    expect(r.input).toBeNull()
  })
})

describe('user configuration', () => {
  it('uses edited keywords and aliases', () => {
    const custom: ParseContext = {
      ...ctx,
      categories: categories.map((c) =>
        c.id === 'cat-food' ? { ...c, keywords: [...c.keywords, 'biryani'] } : c,
      ),
      accounts: accounts.map((a) =>
        a.id === 'acc-other-bank'
          ? { ...a, name: 'ICICI', aliases: ['icici', 'salary account'] }
          : a,
      ),
    }
    expect(parseEntry('Spent 300 on biryani from salary account', custom).input).toMatchObject({
      categoryId: 'cat-food',
      accountId: 'acc-other-bank',
    })
  })

  it('ignores archived categories and accounts', () => {
    const archived: ParseContext = {
      ...ctx,
      accounts: accounts.map((a) => (a.id === 'acc-cash' ? { ...a, archived: true } : a)),
    }
    expect(parseEntry('Spent 60 on chai in cash', archived).accountId).toBe('acc-hdfc')
  })
})

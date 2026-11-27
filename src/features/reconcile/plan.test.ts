import { describe, expect, it } from 'vitest'
import { SEED_ACCOUNTS, SEED_CATEGORIES } from '../../data/seed'
import type { Account, Category } from '../../domain/types'
import type { EmailRow } from '../../parser/emailSweep'
import { makeTransaction } from '../../test/factories'
import { buildEmailPlan, defaultDraft, guessEmailAccount, toEntry } from './plan'

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

let n = 0
const email = (p: Partial<EmailRow> = {}): EmailRow => ({
  key: `email-${++n}`,
  date: '2026-11-10',
  amount: 45_000,
  direction: 'out',
  narration: 'Swiggy',
  ...p,
})
const file = (rows: EmailRow[]) => [
  { id: 'f', name: 'entries.txt', rows, from: '2026-11-01', to: '2026-11-30', skipped: 0 },
]

describe('guessEmailAccount', () => {
  it('maps a bank template to that bank’s account', () => {
    expect(guessEmailAccount('hdfc-upi', accounts, 'acc-other-bank')).toBe('acc-hdfc')
  })

  it('maps a card template to a credit card', () => {
    expect(guessEmailAccount('hdfc-card', accounts, 'acc-hdfc')).toBe('acc-credit-card')
  })

  it('falls back to the default account when it cannot tell', () => {
    expect(guessEmailAccount('generic', accounts, 'acc-hdfc')).toBe('acc-hdfc')
    expect(guessEmailAccount(undefined, accounts, 'acc-hdfc')).toBe('acc-hdfc')
    expect(guessEmailAccount('icici', accounts, 'acc-hdfc')).toBe('acc-hdfc')
  })

  it('maps a cash payment to the Cash account', () => {
    expect(guessEmailAccount('uber-cash', accounts, 'acc-hdfc')).toBe('acc-cash')
    const none = accounts.filter((a) => a.type !== 'cash')
    expect(guessEmailAccount('uber-cash', none, 'acc-hdfc')).toBe('acc-hdfc')
  })

  it('never picks an archived account', () => {
    const list = accounts.map((a) => (a.id === 'acc-hdfc' ? { ...a, archived: true } : a))
    expect(guessEmailAccount('hdfc-upi', list, 'acc-other-bank')).toBe('acc-other-bank')
  })
})

describe('buildEmailPlan', () => {
  it('matches an emailed spend to an entry on any account', () => {
    const t = makeTransaction({ amount: 45_000, date: '2026-11-11', accountId: 'acc-credit-card' })
    const plan = buildEmailPlan(file([email()]), [t], accounts, [])
    expect(plan.matched).toHaveLength(1)
    expect(plan.matched[0]!.accountId).toBe('acc-credit-card')
    expect(plan.missing).toEqual([])
  })

  it('lists emails with no entry as missing, with a guessed account', () => {
    const plan = buildEmailPlan(file([email({ via: 'hdfc-card' })]), [], accounts, [])
    expect(plan.missing).toHaveLength(1)
    expect(plan.missing[0]!.accountId).toBe('acc-credit-card')
  })

  it('reports a different amount as a conflict', () => {
    const t = makeTransaction({ amount: 44_000, description: 'Swiggy order', date: '2026-11-10' })
    const plan = buildEmailPlan(file([email()]), [t], accounts, [])
    expect(plan.conflicts).toHaveLength(1)
    expect(plan.conflicts[0]!.difference).toBe(1_000)
  })

  it('counts a remembered emailRef as matched even when the amount changed', () => {
    const e = email({ amount: 99_999 })
    const t = makeTransaction({ amount: 45_000, emailRef: e.key, date: '2026-11-10' })
    const plan = buildEmailPlan(file([e]), [t], accounts, [])
    expect(plan.matched).toEqual([{ row: e, tx: t, viaRef: true, accountId: 'acc-hdfc' }])
  })

  it('only calls an entry extra when its merchant emails you', () => {
    const swiggy = makeTransaction({
      description: 'Swiggy order',
      merchant: 'Swiggy',
      amount: 11_100,
      date: '2026-11-05',
    })
    const cash = makeTransaction({
      description: 'Chai at the stall',
      amount: 2_000,
      date: '2026-11-06',
    })
    const plan = buildEmailPlan(
      file([email({ date: '2026-11-01' }), email({ date: '2026-11-30', amount: 1 })]),
      [swiggy, cash],
      accounts,
      [],
    )
    expect(plan.extra).toEqual([swiggy])
  })

  it('ignores merchants you chose to ignore, and merges several files without repeats', () => {
    const a = email({ narration: 'Spam Shop' })
    const dup = { ...a }
    const plan = buildEmailPlan([...file([a]), { ...file([dup])[0]!, id: 'g' }], [], accounts, [
      'spam shop',
    ])
    expect(plan.ignored).toHaveLength(1)
    expect(plan.missing).toEqual([])
  })

  it('has nothing to say about an empty file', () => {
    expect(buildEmailPlan([], [], accounts, [])).toEqual({
      matched: [],
      conflicts: [],
      missing: [],
      extra: [],
      ignored: [],
    })
  })

  it('sorts missing spends newest first', () => {
    const plan = buildEmailPlan(
      file([
        email({ date: '2026-11-02', narration: 'A' }),
        email({ date: '2026-11-20', narration: 'B' }),
      ]),
      [],
      accounts,
      [],
    )
    expect(plan.missing.map((m) => m.row.date)).toEqual(['2026-11-20', '2026-11-02'])
  })
})

describe('adding an emailed spend', () => {
  it('remembers the email, not a bank row, and uses the chosen account', () => {
    const row = email({ via: 'hdfc-upi' })
    const [item] = buildEmailPlan(file([row]), [], accounts, []).missing
    const draft = { ...defaultDraft(item!, [], categories), accountId: 'acc-credit-card' }
    const entry = toEntry(item!, draft, 'email')
    expect(entry?.emailRef).toBe(row.key)
    expect(entry?.bankRef).toBeUndefined()
    expect(entry?.input).toMatchObject({
      type: 'expense',
      amount: 45_000,
      accountId: 'acc-credit-card',
      paymentMethod: 'upi',
      merchant: 'Swiggy',
      categoryId: 'cat-food',
    })
  })

  it('suggests a category from the merchant name, and flags a guess for review', () => {
    const [item] = buildEmailPlan(file([email({ narration: 'Swiggy' })]), [], accounts, []).missing
    expect(defaultDraft(item!, [], categories)).toMatchObject({
      choice: 'cat:cat-food',
      needsReview: true,
    })
  })

  it('a bank row still remembers a bank reference', () => {
    const [item] = buildEmailPlan(file([email()]), [], accounts, []).missing
    const entry = toEntry(item!, defaultDraft(item!, [], categories), 'bank')
    expect(entry?.bankRef).toBe(item!.row.key)
    expect(entry?.emailRef).toBeUndefined()
  })
})

describe('email conflicts', () => {
  it('pairs a different amount only with the same merchant', () => {
    const swiggy = makeTransaction({
      description: 'Swiggy order',
      amount: 26_800,
      date: '2026-11-07',
    })
    const rows = [
      email({ narration: 'Swiggy', amount: 27_000, date: '2026-11-07' }),
      email({ narration: 'Uber', amount: 26_900, date: '2026-11-07' }),
    ]
    const plan = buildEmailPlan(file(rows), [swiggy], accounts, [])
    expect(plan.conflicts.map((c) => c.row.narration)).toEqual(['Swiggy'])
    expect(plan.missing.map((m) => m.row.narration)).toEqual(['Uber'])
  })
})

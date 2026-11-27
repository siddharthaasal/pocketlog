import { describe, expect, it } from 'vitest'
import { makeTransaction as baseTransaction, makeTransfer } from '../test/factories'
import {
  extractPayee,
  isNoise,
  pairTransfers,
  payeeKey,
  reconcile,
  suggestCategory,
  type StatementRow,
} from './reconcile'
import type { Category, Transaction } from './types'

let n = 0
const makeTransaction = (p: Partial<Transaction> = {}) =>
  baseTransaction({ date: '2026-11-10', amount: 10_000, ...p })
const row = (p: Partial<StatementRow> = {}): StatementRow => ({
  key: `r${++n}`,
  date: '2026-11-10',
  amount: 10_000,
  direction: 'out',
  narration: 'UPI-SOMEONE-x@y-BANK0-1-UPI',
  ...p,
})

describe('reconcile', () => {
  it('matches the same amount on the same day', () => {
    const r = row()
    const t = makeTransaction({ amount: 10_000 })
    t.date = '2026-11-10'
    const res = reconcile([r], [t], 'acc-hdfc')
    expect(res.matched).toEqual([{ row: r, tx: t, viaRef: false }])
    expect(res.missing).toEqual([])
    expect(res.extra).toEqual([])
  })

  it('tolerates a date a couple of days off, but not more', () => {
    const r = row()
    const near = makeTransaction({ date: '2026-11-12' })
    const far = makeTransaction({ date: '2026-11-13', amount: 10_000 })
    expect(reconcile([r], [near], 'acc-hdfc').matched).toHaveLength(1)
    expect(reconcile([r], [far], 'acc-hdfc').matched).toHaveLength(0)
  })

  it('uses each entry once: two identical bank rows need two entries', () => {
    const rows = [row(), row()]
    const res = reconcile(rows, [makeTransaction({ amount: 10_000 })], 'acc-hdfc')
    expect(res.matched).toHaveLength(1)
    expect(res.missing).toHaveLength(1)
  })

  it('prefers the closest date when several entries have the same amount', () => {
    const r = row({ date: '2026-11-10' })
    const a = makeTransaction({ date: '2026-11-12' })
    const b = makeTransaction({ date: '2026-11-10' })
    const res = reconcile([r], [a, b], 'acc-hdfc')
    expect(res.matched[0]!.tx).toBe(b)
    expect(res.extra).toEqual([])
  })

  it('does not match across directions or accounts', () => {
    const r = row({ direction: 'in' })
    const wrongSide = makeTransaction()
    const wrongAccount = makeTransaction({
      accountId: 'acc-other',
      type: 'income',
      categoryId: 'x',
    })
    const res = reconcile([r], [wrongSide, wrongAccount], 'acc-hdfc')
    expect(res.matched).toHaveLength(0)
    expect(res.missing).toEqual([r])
  })

  it('reports a close amount as a conflict, with the difference', () => {
    const r = row({ amount: 81_238 })
    const t = makeTransaction({ amount: 81_200 })
    const res = reconcile([r], [t], 'acc-hdfc')
    expect(res.matched).toHaveLength(0)
    expect(res.conflicts).toEqual([{ row: r, tx: t, difference: 38 }])
  })

  it('reports a different amount as a conflict when the payee matches', () => {
    const r = row({ amount: 24_900, narration: 'UPI-BARBEQUE NATION-x@axl-UTIB0-1-UPI' })
    const t = makeTransaction({ amount: 93_800, merchant: 'Barbeque Nation' })
    const res = reconcile([r], [t], 'acc-hdfc')
    expect(res.conflicts).toHaveLength(1)
  })

  it('leaves unrelated different amounts as missing + extra', () => {
    const r = row({ amount: 50_000 })
    const t = makeTransaction({ amount: 10_000, merchant: 'Chai' })
    const res = reconcile([r], [t], 'acc-hdfc')
    expect(res.conflicts).toHaveLength(0)
    expect(res.missing).toEqual([r])
    expect(res.extra).toEqual([t])
  })

  it('only calls an entry "extra" inside the statement period', () => {
    const r = row({ date: '2026-11-10' })
    const inside = makeTransaction({ date: '2026-11-10', amount: 7_700 })
    const outside = makeTransaction({ date: '2026-11-12', amount: 7_700 })
    const res = reconcile([r], [inside, outside], 'acc-hdfc')
    expect(res.extra).toEqual([inside])
  })

  it('trusts a remembered bankRef over amount and date', () => {
    const r = row({ amount: 10_000, date: '2026-11-10' })
    const edited = makeTransaction({ amount: 99_900, date: '2026-11-11', bankRef: r.key })
    const res = reconcile([r], [edited], 'acc-hdfc')
    expect(res.matched).toEqual([{ row: r, tx: edited, viaRef: true }])
  })

  it('does not report entries that came from another statement row as extra', () => {
    const r = row({ date: '2026-11-10' })
    const fromBank = makeTransaction({ date: '2026-11-10', amount: 3_300, bankRef: 'other' })
    expect(reconcile([r], [fromBank], 'acc-hdfc').extra).toEqual([])
  })

  it('sees transfers on both accounts', () => {
    const t = makeTransfer('acc-pnb', 'acc-hdfc', 85_600, { date: '2026-11-02' })
    const out = row({ amount: 85_600, date: '2026-11-02' })
    const into = row({ amount: 85_600, date: '2026-11-02', direction: 'in' })
    expect(reconcile([out], [t], 'acc-pnb').matched).toHaveLength(1)
    expect(reconcile([into], [t], 'acc-hdfc').matched).toHaveLength(1)
    expect(reconcile([into], [t], 'acc-pnb').matched).toHaveLength(0)
  })

  it('ignores deleted entries', () => {
    const t = makeTransaction({ deletedAt: '2026-11-11T00:00:00.000Z' })
    expect(reconcile([row()], [t], 'acc-hdfc').matched).toHaveLength(0)
  })

  it('gives the same answer every time', () => {
    const rows = [row(), row({ amount: 5_000 }), row({ amount: 5_000 })]
    const txs = [makeTransaction({ amount: 5_000 }), makeTransaction({ amount: 9_000 })]
    const key = (x: unknown) => JSON.stringify(x)
    expect(key(reconcile(rows, txs, 'acc-hdfc'))).toBe(key(reconcile(rows, txs, 'acc-hdfc')))
  })
})

describe('pairTransfers', () => {
  it('pairs a debit on one account with an equal credit on another', () => {
    const out = { accountId: 'pnb', row: row({ amount: 5_000_000, date: '2026-11-20' }) }
    const into = {
      accountId: 'hdfc',
      row: row({ amount: 5_000_000, date: '2026-11-20', direction: 'in' }),
    }
    const lone = { accountId: 'hdfc', row: row({ amount: 100 }) }
    const { pairs, rest } = pairTransfers([out, into, lone])
    expect(pairs).toEqual([{ out, into }])
    expect(rest).toEqual([lone])
  })

  it('never pairs within one account', () => {
    const a = { accountId: 'hdfc', row: row({ amount: 100 }) }
    const b = { accountId: 'hdfc', row: row({ amount: 100, direction: 'in' }) }
    expect(pairTransfers([a, b]).pairs).toEqual([])
  })
})

describe('payees', () => {
  it('reads HDFC UPI, PNB UPI and card narrations', () => {
    expect(extractPayee('UPI-SWIGGY INSTAMART PRI-***MART@AXB-UTIB0000100-1-UPI')).toBe(
      'Swiggy Instamart Pri',
    )
    expect(
      extractPayee('UPI-AUTOPAY-APPLE MEDIA SERVICES-X@HDFCBANK-HDFC0MERUPI-1-EXECUTION TEST'),
    ).toBe('Apple Media Services')
    expect(extractPayee('UPI/DR/632972033649/SHALINI/YESB/bharatpe9s0h7z3/P')).toBe('Shalini')
    expect(
      extractPayee(
        'POS 406584XXXXXX2663 632408398947 20NOV26 10:59:02 MOUNTAIN VIEW GOOGLE *CHROME',
      ),
    ).toContain('Google')
  })

  it('groups spellings of one payee', () => {
    expect(payeeKey('Swiggy Limited')).toBe(payeeKey('SWIGGY'))
    expect(payeeKey('Swiggy Instamart Pri')).toBe('swiggy instamart')
    expect(payeeKey('Swiggy Instamart')).not.toBe(payeeKey('Swiggy'))
  })
})

describe('suggestCategory', () => {
  const cat = (id: string, keywords: string[] = [], type: Category['type'] = 'expense') =>
    ({ id, name: id, type, icon: 'x', color: '#000000', keywords, archived: false }) as Category
  const categories = [cat('food', ['swiggy']), cat('groceries', ['instamart']), cat('misc')]
  const r = row({ narration: 'UPI-SWIGGY LIMITED-x@y-UTIB0-1-UPI' })

  it('prefers what you chose for the same payee before', () => {
    const history = [
      makeTransaction({ merchant: 'Swiggy', categoryId: 'misc' }),
      makeTransaction({ merchant: 'Swiggy', categoryId: 'misc' }),
      makeTransaction({ merchant: 'Swiggy', categoryId: 'food' }),
    ]
    expect(suggestCategory(r, history, categories)).toEqual({
      categoryId: 'misc',
      basis: 'history',
    })
  })

  it('ignores guesses nobody confirmed', () => {
    const history = [makeTransaction({ merchant: 'Swiggy', categoryId: 'misc', needsReview: true })]
    expect(suggestCategory(r, history, categories)?.basis).toBe('keyword')
  })

  it('falls back to category keywords, then to nothing', () => {
    expect(suggestCategory(r, [], categories)).toEqual({ categoryId: 'food', basis: 'keyword' })
    expect(suggestCategory(row({ narration: 'UPI-RANDOM GUY-x-1-UPI' }), [], categories)).toBeNull()
  })
})

describe('isNoise', () => {
  it('flags bank validation credits and learned payees, not real payments', () => {
    const credit = row({
      direction: 'in',
      amount: 100,
      narration: 'IMPS-1-APIBANKING-RATN-X-ACCOUNTVALIDATION',
    })
    expect(isNoise(credit, [])).toBe(true)
    const rupee = row({
      direction: 'in',
      amount: 100,
      narration: 'IMPS-IN/632628000021/911234567890/APIBANKI',
    })
    expect(isNoise(rupee, [])).toBe(true)
    expect(
      isNoise(
        row({ direction: 'in', amount: 5_000_00, narration: 'IMPS-1-ACCOUNTVALIDATION' }),
        [],
      ),
    ).toBe(false)
    const payee = row({ narration: 'UPI-VENDOLITE INDIA 12-x-1-UPI' })
    expect(isNoise(payee, [])).toBe(false)
    expect(isNoise(payee, [payeeKey('Vendolite India 12')])).toBe(true)
  })
})

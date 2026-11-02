import { describe, expect, it } from 'vitest'
import { makeTransaction, makeTransfer } from '../test/factories'
import { filterTransactions, sortTransactions } from './filters'

const lunch = makeTransaction({
  description: 'Lunch with team',
  merchant: 'Truffles',
  amount: 350_00,
  date: '2026-11-02',
})
const fuel = makeTransaction({
  description: 'Petrol',
  categoryId: 'cat-fuel',
  accountId: 'card',
  amount: 1_200_00,
  date: '2026-11-01',
})
const salary = makeTransaction({
  type: 'income',
  description: 'Salary',
  categoryId: 'cat-salary',
  amount: 85_000_00,
  date: '2026-10-31',
})
const atm = makeTransfer('hdfc', 'cash', 2_000_00, {
  description: 'ATM',
  date: '2026-10-15',
  notes: 'Koramangala ATM',
})
const deleted = makeTransaction({ description: 'Lunch', deletedAt: '2026-11-02T00:00:00.000Z' })
const all = [lunch, fuel, salary, atm, deleted]

const ids = (list: { id: string }[]) => list.map((t) => t.id)

describe('filterTransactions', () => {
  it('returns everything except deleted rows with no filters', () => {
    expect(ids(filterTransactions(all, {}))).toEqual(ids([lunch, fuel, salary, atm]))
  })

  it('searches description, merchant and notes, all words, case-insensitive', () => {
    expect(ids(filterTransactions(all, { query: 'TRUFFLES' }))).toEqual([lunch.id])
    expect(ids(filterTransactions(all, { query: 'lunch team' }))).toEqual([lunch.id])
    expect(ids(filterTransactions(all, { query: 'lunch petrol' }))).toEqual([])
    expect(ids(filterTransactions(all, { query: 'koramangala' }))).toEqual([atm.id])
  })

  it('filters by type and category', () => {
    expect(ids(filterTransactions(all, { type: 'income' }))).toEqual([salary.id])
    expect(ids(filterTransactions(all, { categoryId: 'cat-fuel' }))).toEqual([fuel.id])
  })

  it('matches an account on either side of a transfer', () => {
    expect(ids(filterTransactions(all, { accountId: 'cash' }))).toEqual([atm.id])
    expect(ids(filterTransactions(all, { accountId: 'card' }))).toEqual([fuel.id])
  })

  it('filters by inclusive date range', () => {
    const result = filterTransactions(all, { from: '2026-10-31', to: '2026-11-01' })
    expect(ids(result)).toEqual([fuel.id, salary.id])
  })
})

describe('sortTransactions', () => {
  const list = [lunch, fuel, salary, atm]
  it('sorts by date both ways', () => {
    expect(ids(sortTransactions(list, 'newest'))).toEqual(ids([lunch, fuel, salary, atm]))
    expect(ids(sortTransactions(list, 'oldest'))).toEqual(ids([atm, salary, fuel, lunch]))
  })

  it('sorts by amount both ways', () => {
    expect(ids(sortTransactions(list, 'largest'))).toEqual(ids([salary, atm, fuel, lunch]))
    expect(ids(sortTransactions(list, 'smallest'))).toEqual(ids([lunch, fuel, atm, salary]))
  })

  it('orders same-day entries by time entered, newest first', () => {
    const first = makeTransaction({ date: '2026-11-05' })
    const second = makeTransaction({ date: '2026-11-05' })
    expect(ids(sortTransactions([first, second], 'newest'))).toEqual(ids([second, first]))
  })

  it('does not mutate the input', () => {
    const input = [atm, lunch]
    sortTransactions(input, 'newest')
    expect(input).toEqual([atm, lunch])
  })
})

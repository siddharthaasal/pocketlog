import type { Account, Transaction } from '../domain/types'

let seq = 0
const STAMP = '2026-11-01T00:00:00.000Z'

export function makeTransaction(partial: Partial<Transaction> = {}): Transaction {
  seq += 1
  return {
    id: `t${seq}`,
    type: 'expense',
    amount: 100,
    currency: 'INR',
    description: '',
    accountId: 'acc-hdfc',
    categoryId: 'cat-food',
    date: '2026-11-01',
    source: 'manual',
    needsReview: false,
    createdAt: new Date(Date.parse(STAMP) + seq * 1000).toISOString(),
    updatedAt: STAMP,
    ...partial,
  }
}

export function makeAccount(partial: Partial<Account> & Pick<Account, 'id'>): Account {
  return {
    name: partial.id,
    type: 'bank',
    openingBalance: 0,
    currency: 'INR',
    aliases: [],
    isDefault: false,
    archived: false,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...partial,
  }
}

export function makeTransfer(
  from: string,
  to: string,
  amount: number,
  partial: Partial<Transaction> = {},
): Transaction {
  return makeTransaction({
    type: 'transfer',
    accountId: from,
    toAccountId: to,
    categoryId: undefined,
    amount,
    ...partial,
  })
}

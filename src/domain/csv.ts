import { paiseToInput } from './money'
import { PAYMENT_METHOD_LABELS, type Account, type Category, type Transaction } from './types'

const HEADER = [
  'Date',
  'Type',
  'Amount (INR)',
  'Description',
  'Merchant',
  'Category',
  'Account',
  'To account',
  'Paid via',
  'Notes',
  'Source',
  'ID',
]

function cell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/** Spreadsheet-friendly export of live transactions, oldest first. Starts with a BOM so Excel reads ₹ correctly. */
export function transactionsToCsv(
  transactions: readonly Transaction[],
  categories: ReadonlyMap<string, Category>,
  accounts: ReadonlyMap<string, Account>,
): string {
  const rows = transactions
    .filter((t) => !t.deletedAt)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((t) => [
      t.date,
      t.type,
      paiseToInput(t.amount),
      t.description,
      t.merchant ?? '',
      t.categoryId ? (categories.get(t.categoryId)?.name ?? '') : '',
      accounts.get(t.accountId)?.name ?? '',
      t.toAccountId ? (accounts.get(t.toAccountId)?.name ?? '') : '',
      t.paymentMethod ? PAYMENT_METHOD_LABELS[t.paymentMethod] : '',
      t.notes ?? '',
      t.source,
      t.id,
    ])
  return '﻿' + [HEADER, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

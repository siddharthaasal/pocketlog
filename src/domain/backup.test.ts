import { describe, expect, it } from 'vitest'
import { makeAccount, makeTransaction } from '../test/factories'
import { createBackup, readBackupText, serializeBackup, type BackupData } from './backup'
import { transactionsToCsv } from './csv'

const data: BackupData = {
  transactions: [makeTransaction({ id: 't1', description: 'Lunch', accountId: 'acc-hdfc' })],
  categories: [],
  accounts: [makeAccount({ id: 'acc-hdfc', name: 'HDFC Bank' })],
  inbox: [],
}
const backup = createBackup(data, '2026-11-03T10:00:00.000Z')

describe('backup files', () => {
  it('round-trips plain JSON', async () => {
    const result = await readBackupText(await serializeBackup(backup))
    expect(result).toEqual({ status: 'ok', backup, invalid: [] })
  })

  it('asks for a passphrase, then round-trips an encrypted file', async () => {
    const text = await serializeBackup(backup, 'secret')
    expect(text).not.toContain('Lunch')
    expect(await readBackupText(text)).toEqual({ status: 'needs-passphrase' })
    expect(await readBackupText(text, 'secret')).toMatchObject({ status: 'ok', backup })
    expect(await readBackupText(text, 'nope')).toMatchObject({
      status: 'error',
      message: expect.stringMatching(/passphrase/),
    })
  }, 20_000)

  it('reports invalid rows instead of dropping them silently', async () => {
    const broken = {
      ...backup,
      data: { ...data, transactions: [...data.transactions, { id: 'bad', amount: -5 }] },
    }
    const result = await readBackupText(JSON.stringify(broken))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.backup.data.transactions.map((t) => t.id)).toEqual(['t1'])
    expect(result.invalid).toEqual([expect.objectContaining({ table: 'transactions', id: 'bad' })])
  })

  it.each([
    ['not json', 'valid JSON'],
    ['{"hello":1}', 'PocketLog backup'],
    ['{"app":"pocketlog","format":99,"data":{}}', 'newer version'],
    ['{"app":"pocketlog","format":1}', 'missing its data'],
    ['{"app":"pocketlog","format":1,"data":{"transactions":"x"}}', 'damaged'],
  ])('refuses %s', async (text, message) => {
    expect(await readBackupText(text)).toMatchObject({
      status: 'error',
      message: expect.stringContaining(message),
    })
  })
})

describe('transactionsToCsv', () => {
  it('names categories and accounts, escapes text and skips deleted rows', () => {
    const csv = transactionsToCsv(
      [
        makeTransaction({
          id: 'x',
          date: '2026-11-02',
          amount: 35050,
          description: 'Lunch, "team"',
          accountId: 'acc-hdfc',
          categoryId: 'cat-food',
        }),
        makeTransaction({ id: 'y', deletedAt: '2026-11-03T00:00:00.000Z' }),
      ],
      new Map([['cat-food', { name: 'Food & Dining' } as never]]),
      new Map([['acc-hdfc', { name: 'HDFC Bank' } as never]]),
    )
    const lines = csv.replace('﻿', '').trim().split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toBe(
      '2026-11-02,expense,350.50,"Lunch, ""team""",,Food & Dining,HDFC Bank,,,,manual,x',
    )
  })
})

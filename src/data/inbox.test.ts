import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { importInboxFile } from './inbox'

const FILE = [
  '2026-11-02T13:45:10+05:30 Spent 350 on lunch using HDFC',
  '2026-11-01T21:02:00+05:30 Spent 300 on a birthday gift',
  '2026-11-01T21:05:00+05:30 Spent money on lunch',
].join('\n')

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('importInboxFile', () => {
  it('adds confident entries, queues uncertain ones and keeps unreadable lines', async () => {
    const summary = await importInboxFile(FILE, '2026-11-02')
    expect(summary).toEqual({ added: 1, toReview: 1, unreadable: 1, alreadyImported: 0 })

    const transactions = await db.transactions.orderBy('date').toArray()
    expect(transactions).toHaveLength(2)
    expect(transactions.every((t) => t.source === 'siri' && t.id.startsWith('siri-'))).toBe(true)
    expect(transactions.find((t) => t.description === 'Birthday gift')).toMatchObject({
      needsReview: true,
      date: '2026-11-01',
    })
    expect(await db.inbox.where('recordedAt').above('').toArray()).toHaveLength(3)
  })

  it('is safe to import the same growing file again', async () => {
    await importInboxFile(FILE, '2026-11-02')
    const again = await importInboxFile(`${FILE}\n2026-11-02T18:00:00+05:30 Uber 230`, '2026-11-02')
    expect(again).toEqual({ added: 1, toReview: 0, unreadable: 0, alreadyImported: 3 })
    expect(await db.transactions.count()).toBe(3)
  })

  it('gives the same line the same transaction id on every device', async () => {
    await importInboxFile(FILE, '2026-11-02')
    const first = (await db.transactions.toArray()).map((t) => t.id).sort()
    await db.delete()
    await db.open()
    await importInboxFile(FILE, '2026-11-02')
    const second = (await db.transactions.toArray()).map((t) => t.id).sort()
    expect(second).toEqual(first)
  })
})

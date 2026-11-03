import { describe, expect, it } from 'vitest'
import { makeAccount, makeTransaction } from '../test/factories'
import type { BackupData } from './backup'
import { extraDefaults } from './accounts'
import { mergeTable, planMerge } from './merge'

const at = (minute: number) => `2026-11-03T10:${String(minute).padStart(2, '0')}:00.000Z`
const rec = (id: string, minute: number, extra: { deletedAt?: string } = {}) => ({
  id,
  updatedAt: at(minute),
  ...extra,
})

describe('mergeTable', () => {
  it('adds new records and counts them', () => {
    const { writes, counts } = mergeTable([], [rec('a', 1)])
    expect(writes.map((r) => r.id)).toEqual(['a'])
    expect(counts).toMatchObject({ added: 1 })
  })

  it('takes the newer version and keeps the local one when it is newer', () => {
    const { writes, counts } = mergeTable([rec('a', 1), rec('b', 5)], [rec('a', 2), rec('b', 4)])
    expect(writes).toEqual([rec('a', 2)])
    expect(counts).toMatchObject({ updated: 1, keptLocal: 1 })
  })

  it('propagates deletions as tombstones', () => {
    const tomb = rec('a', 2, { deletedAt: at(2) })
    const { writes, counts } = mergeTable([rec('a', 1)], [tomb])
    expect(writes).toEqual([tomb])
    expect(counts.deleted).toBe(1)
  })

  it('an edit made after a delete on the other device wins', () => {
    const { writes } = mergeTable([rec('a', 1, { deletedAt: at(1) })], [rec('a', 3)])
    expect(writes).toEqual([rec('a', 3)])
  })

  it('is idempotent: merging the same data again writes nothing', () => {
    const local = [rec('a', 1), rec('b', 2)]
    expect(mergeTable(local, local)).toEqual({
      writes: [],
      counts: { added: 0, updated: 0, deleted: 0, unchanged: 2, keptLocal: 0 },
    })
  })
})

describe('planMerge', () => {
  const empty: BackupData = { transactions: [], categories: [], accounts: [], inbox: [] }
  const hdfc = makeAccount({ id: 'acc-hdfc' })

  it('rejects transactions that point at missing accounts or categories', () => {
    const plan = planMerge(
      { ...empty, accounts: [hdfc] },
      {
        ...empty,
        transactions: [
          makeTransaction({
            id: 'ok',
            categoryId: undefined,
            type: 'transfer',
            toAccountId: 'acc-hdfc',
            accountId: 'acc-hdfc',
          }),
          makeTransaction({ id: 'bad', accountId: 'ghost', categoryId: undefined }),
        ],
      },
    )
    expect(plan.writes.transactions.map((t) => t.id)).toEqual(['ok'])
    expect(plan.invalid).toEqual([expect.objectContaining({ table: 'transactions', id: 'bad' })])
  })

  it('accepts references that arrive in the same file', () => {
    const plan = planMerge(empty, {
      ...empty,
      accounts: [hdfc],
      transactions: [
        makeTransaction({
          id: 't',
          accountId: 'acc-hdfc',
          categoryId: undefined,
          type: 'transfer',
          toAccountId: 'acc-hdfc',
        }),
      ],
    })
    expect(plan.invalid).toEqual([])
    expect(plan.counts.transactions.added).toBe(1)
  })

  it('keeps inbox entries from both sides, preferring imported ones', () => {
    const plan = planMerge(
      { ...empty, inbox: [{ key: 'k1', rawText: 'x', recordedAt: at(1), status: 'unparsed' }] },
      {
        ...empty,
        inbox: [
          { key: 'k1', rawText: 'x', recordedAt: at(1), status: 'imported', transactionId: 't' },
          { key: 'k2', rawText: 'y', recordedAt: at(2), status: 'unparsed' },
        ],
      },
    )
    expect(plan.writes.inbox.map((e) => e.key)).toEqual(['k1', 'k2'])
  })
})

describe('extraDefaults', () => {
  it('keeps only the most recently changed default', () => {
    const older = makeAccount({ id: 'a', isDefault: true, updatedAt: at(1) })
    const newer = makeAccount({ id: 'b', isDefault: true, updatedAt: at(2) })
    expect(extraDefaults([older, newer]).map((a) => a.id)).toEqual(['a'])
  })
})

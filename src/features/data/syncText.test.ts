import { describe, expect, it } from 'vitest'
import { describeSync, shortStatus } from './syncText'

const now = new Date('2026-11-28T12:00:00')

describe('sync status text', () => {
  it('says when, from where, and how old the file was', () => {
    expect(
      describeSync(
        { at: '2026-11-24T09:00:00', exportedAt: '2026-11-23T20:00:00', from: 'Mac' },
        now,
      ),
    ).toBe('Last synced 4 days ago, from your Mac (file made 5 days ago).')
    expect(
      describeSync({ at: '2026-11-28T09:00:00', exportedAt: '2026-11-28T08:00:00' }, now),
    ).toBe('Last synced today.')
    expect(describeSync({ at: '2026-11-27T09:00:00', from: 'another device' }, now)).toBe(
      'Last synced yesterday, from another device.',
    )
  })

  it('shortens to the latest sync, else the latest backup', () => {
    expect(shortStatus(undefined, undefined)).toBe('')
  })
})

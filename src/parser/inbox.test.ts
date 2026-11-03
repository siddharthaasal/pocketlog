import { describe, expect, it } from 'vitest'
import { parseInboxFile, sha256Hex } from './inbox'

describe('parseInboxFile', () => {
  it('reads timestamped lines from the Shortcut', () => {
    const lines = parseInboxFile(
      '2026-11-02T13:45:10+05:30 Spent 350 on lunch using HDFC\n2026-11-01T21:02:00+05:30\tPaid 1200 for petrol\n',
    )
    expect(lines).toEqual([
      {
        raw: '2026-11-02T13:45:10+05:30 Spent 350 on lunch using HDFC',
        text: 'Spent 350 on lunch using HDFC',
        recordedAt: '2026-11-02T13:45:10+05:30',
        date: '2026-11-02',
      },
      {
        raw: '2026-11-01T21:02:00+05:30\tPaid 1200 for petrol',
        text: 'Paid 1200 for petrol',
        recordedAt: '2026-11-01T21:02:00+05:30',
        date: '2026-11-01',
      },
    ])
  })

  it('accepts lines without a timestamp, Windows line endings and blank lines', () => {
    expect(parseInboxFile('Spent 50 on tea\r\n\r\n  \nSwiggy 450')).toEqual([
      { raw: 'Spent 50 on tea', text: 'Spent 50 on tea' },
      { raw: 'Swiggy 450', text: 'Swiggy 450' },
    ])
  })

  it('does not mistake a leading number for a timestamp', () => {
    expect(parseInboxFile('350 on lunch')[0]).toEqual({ raw: '350 on lunch', text: '350 on lunch' })
  })
})

describe('sha256Hex', () => {
  it('is stable and distinguishes lines', async () => {
    const a = await sha256Hex('2026-11-02T13:45:10+05:30 Spent 350 on lunch')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await sha256Hex('2026-11-02T13:45:10+05:30 Spent 350 on lunch')).toBe(a)
    expect(await sha256Hex('2026-11-02T13:45:11+05:30 Spent 350 on lunch')).not.toBe(a)
  })
})

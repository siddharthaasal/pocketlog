import { describe, expect, it } from 'vitest'
import { looksLikeEmailSweep, parseEmailSweep } from './emailSweep'

const ok = (text: string) => {
  const r = parseEmailSweep(text)
  if (!r.ok) throw new Error(r.message)
  return r.sweep
}

describe('parseEmailSweep', () => {
  it('reads the sweep line format', () => {
    const { rows, from, to, skipped } = ok(
      [
        '2026-11-27 | 450.00 | Swiggy | src=email status=unconfirmed via=hdfc-upi mid=<a1@mail.example>',
        '2026-11-20 | 1,299 | Amazon | src=email status=unconfirmed via=generic mid=<b2@mail.example>',
      ].join('\n'),
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      date: '2026-11-27',
      amount: 45_000,
      direction: 'out',
      narration: 'Swiggy',
      via: 'hdfc-upi',
    })
    expect(rows[1]).toMatchObject({ amount: 129_900, narration: 'Amazon' })
    expect([from, to, skipped]).toEqual(['2026-11-20', '2026-11-27', 0])
  })

  it('gives each email a stable key from its Message-ID', () => {
    const line = '2026-11-27 | 450.00 | Swiggy | mid=<a1@mail.example>'
    const a = ok(line).rows[0]!.key
    const b = ok(`2026-11-28 | 450.00 | Swiggy again | mid=<a1@mail.example>`).rows[0]!.key
    expect(a).toBe(b)
    expect(a.startsWith('email-')).toBe(true)
  })

  it('counts an email swept twice once', () => {
    const line = '2026-11-27 | 450.00 | Swiggy | mid=<a1@mail.example>'
    expect(ok(`${line}\n${line}`).rows).toHaveLength(1)
  })

  it('keeps identical lines without a Message-ID as separate spends', () => {
    const rows = ok('2026-11-27 | 50 | Chai\n2026-11-27 | 50 | Chai').rows
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r) => r.key)).size).toBe(2)
  })

  it('accepts a timestamp, currency marks and extra spaces', () => {
    const rows = ok(
      '2026-11-27T14:05:00+05:30 |  ₹ 99.50 |  Zomato   Gold  | mid=x\n2026-11-26 | Rs. 10 | Metro | mid=y\n2026-11-25 | INR 7 | Tea | mid=z',
    ).rows
    expect(rows.map((r) => [r.date, r.amount, r.narration])).toEqual([
      ['2026-11-27', 9_950, 'Zomato Gold'],
      ['2026-11-26', 1_000, 'Metro'],
      ['2026-11-25', 700, 'Tea'],
    ])
  })

  it('ignores blank lines and comments, and counts unreadable lines', () => {
    const { rows, skipped } = ok(
      '# header\n\n2026-11-27 | 450 | Swiggy | mid=a\nnot a line\n2026-13-45 | 10 | Bad date | mid=b\n2026-11-27 | abc | Bad amount | mid=c\n2026-11-27 | 0 | Zero | mid=d\n2026-11-27 | 10 |  | mid=e',
    )
    expect(rows).toHaveLength(1)
    expect(skipped).toBe(5)
  })

  it('fails with a helpful message when nothing can be read', () => {
    const r = parseEmailSweep('hello\nworld')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/No spends/)
    expect(parseEmailSweep('').ok).toBe(false)
  })

  it('handles Windows line endings', () => {
    expect(ok('2026-11-27 | 1 | A | mid=1\r\n2026-11-26 | 2 | B | mid=2\r\n').rows).toHaveLength(2)
  })

  it('reads a merchant that contains a colon, quote or unicode', () => {
    expect(ok('2026-11-27 | 10 | Café “Chai” — चाय | mid=1').rows[0]!.narration).toBe(
      'Café “Chai” — चाय',
    )
  })
})

describe('looksLikeEmailSweep', () => {
  it('recognises sweep text and rejects statements', () => {
    expect(looksLikeEmailSweep('2026-11-27 | 450.00 | Swiggy | mid=a')).toBe(true)
    expect(looksLikeEmailSweep('# note\n2026-11-27 | 450.00 | Swiggy')).toBe(true)
    expect(looksLikeEmailSweep('Date,Narration,Withdrawal Amt.\n01/11/26,UPI,100')).toBe(false)
    expect(looksLikeEmailSweep('')).toBe(false)
    expect(looksLikeEmailSweep('Spent 350 on lunch')).toBe(false)
  })
})

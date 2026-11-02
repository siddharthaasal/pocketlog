import { describe, expect, it } from 'vitest'
import { formatINR, formatINRCompact, niceCeiling, paiseToInput, parseRupees } from './money'

describe('parseRupees', () => {
  it.each([
    ['350', 35000],
    ['350.5', 35050],
    ['350.05', 35005],
    ['1,200', 120000],
    ['₹ 99.99', 9999],
    ['0.01', 1],
    ['0', 0],
  ])('%s → %i paise', (input, expected) => {
    expect(parseRupees(input)).toBe(expected)
  })

  it.each(['', 'abc', '1.234', '-5', '1e3', '.5', '12.'])('rejects %j', (input) => {
    expect(parseRupees(input)).toBeNull()
  })

  it('avoids floating-point error', () => {
    // 0.1 + 0.2 style bugs: 19.99 * 100 = 1998.9999999999998 in floats.
    expect(parseRupees('19.99')).toBe(1999)
    expect(parseRupees('1.15')).toBe(115)
  })
})

describe('paiseToInput', () => {
  it('round-trips through parseRupees', () => {
    for (const paise of [0, 1, 99, 100, 35050, 120000]) {
      expect(parseRupees(paiseToInput(paise))).toBe(paise)
    }
  })

  it('keeps the sign', () => {
    expect(paiseToInput(-150050)).toBe('-1500.50')
  })
})

describe('formatINR', () => {
  it('uses Indian digit grouping and hides zero paise', () => {
    expect(formatINR(1234567_00)).toBe('₹12,34,567')
    expect(formatINR(35050)).toBe('₹350.50')
    expect(formatINR(-5000)).toBe('-₹50')
  })
})

describe('formatINRCompact', () => {
  it('uses thousands, lakhs and crores', () => {
    expect(formatINRCompact(950_00)).toBe('₹950')
    expect(formatINRCompact(25_500_00)).toBe('₹25.5K')
    expect(formatINRCompact(1_20_000_00)).toBe('₹1.2L')
    expect(formatINRCompact(2_30_00_000_00)).toBe('₹2.3Cr')
  })
})

describe('niceCeiling', () => {
  it('rounds up to a clean axis maximum', () => {
    expect(niceCeiling(0)).toBe(0)
    expect(niceCeiling(37_000_00)).toBe(40_000_00)
    expect(niceCeiling(52_569_00)).toBe(60_000_00)
    expect(niceCeiling(24_400_50)).toBe(25_000_00)
    expect(niceCeiling(10_000_00)).toBe(10_000_00)
    expect(niceCeiling(10_000_01)).toBe(15_000_00)
  })
})

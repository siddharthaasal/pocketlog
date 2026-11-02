import { describe, expect, it } from 'vitest'
import { formatINR, paiseToInput, parseRupees } from './money'

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

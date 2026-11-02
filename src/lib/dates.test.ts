import { describe, expect, it } from 'vitest'
import { addDays, formatDayHeading, monthBounds, shiftMonth, toISODate } from './dates'

describe('dates', () => {
  it('formats local dates without time zone shifts', () => {
    expect(toISODate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('shifts months across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })

  it('month bounds include the last day of every month', () => {
    const [start, end] = monthBounds('2026-02')
    expect('2026-02-01' >= start && '2026-02-28' <= end).toBe(true)
    expect('2026-03-01' <= end).toBe(false)
  })

  it('labels today and yesterday', () => {
    expect(formatDayHeading('2026-11-02', '2026-11-02')).toBe('Today')
    expect(formatDayHeading('2026-11-01', '2026-11-02')).toBe('Yesterday')
  })
})

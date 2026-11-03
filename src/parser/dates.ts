import { addDays, fromISODate, toISODate } from '../lib/dates'
import { consumePreceding, markUsed, type Token } from './tokens'

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sun: 0,
  mon: 1,
  tue: 2,
  tues: 2,
  wed: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  fri: 5,
  sat: 6,
}
const FULL_WEEKDAYS = new Set([
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
])

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}

const DAY_PATTERN = /^(\d{1,2})(st|nd|rd|th)?$/
const LEAD_WORDS = new Set(['on', 'last', 'this', 'the'])

function isValidDay(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day)
  return d.getMonth() === month - 1 && d.getDate() === day
}

function iso(year: number, month: number, day: number): string {
  return toISODate(new Date(year, month - 1, day))
}

/** A calendar date with no year means the most recent one that isn't in the future. */
function pastDayOfMonth(today: string, month: number, day: number): string | null {
  const year = Number(today.slice(0, 4))
  for (const y of [year, year - 1]) {
    if (isValidDay(y, month, day) && iso(y, month, day) <= today) return iso(y, month, day)
  }
  return null
}

interface Match {
  start: number
  length: number
  date: string
}

function matchAt(tokens: readonly Token[], i: number, today: string): Match | null {
  const w = (k: number) => tokens[i + k]?.lower ?? ''
  const free = (k: number) => tokens[i + k] !== undefined && !tokens[i + k]!.used

  if (w(0) === 'day' && w(1) === 'before' && w(2) === 'yesterday')
    return { start: i, length: 3, date: addDays(today, -2) }
  if (w(0) === 'yesterday') return { start: i, length: 1, date: addDays(today, -1) }
  if (w(0) === 'today' || w(0) === 'tonight') return { start: i, length: 1, date: today }

  // "3 days ago"
  if (/^\d{1,3}$/.test(w(0)) && (w(1) === 'days' || w(1) === 'day') && w(2) === 'ago')
    return { start: i, length: 3, date: addDays(today, -Number(w(0))) }

  // "last friday", "on monday", "monday"
  const weekday = WEEKDAYS[w(0)]
  if (weekday !== undefined) {
    const lead = tokens[i - 1]?.lower
    if (!FULL_WEEKDAYS.has(w(0)) && lead !== 'on' && lead !== 'last') return null
    const todayDow = fromISODate(today).getDay()
    let back = (todayDow - weekday + 7) % 7
    if (lead === 'last' && back === 0) back = 7
    return { start: i, length: 1, date: addDays(today, -back) }
  }

  // "5th november", "5 of nov", "nov 5", "november 5th"
  const day = DAY_PATTERN.exec(w(0))
  if (day) {
    const ofOffset = w(1) === 'of' ? 1 : 0
    const month = MONTHS[w(1 + ofOffset)]
    if (month && free(1 + ofOffset)) {
      const date = pastDayOfMonth(today, month, Number(day[1]))
      if (date) return { start: i, length: 2 + ofOffset, date }
    }
  }
  const monthFirst = MONTHS[w(0)]
  const dayAfter = DAY_PATTERN.exec(w(1))
  if (monthFirst && dayAfter && free(1)) {
    const date = pastDayOfMonth(today, monthFirst, Number(dayAfter[1]))
    if (date) return { start: i, length: 2, date }
  }

  // "on the 5th" / "on 5th": needs an ordinal or "the", so a bare "on 500" stays an amount.
  if (
    day &&
    (day[2] || tokens[i - 1]?.lower === 'the') &&
    ['on', 'the'].includes(tokens[i - 1]?.lower ?? '')
  ) {
    const month = Number(today.slice(5, 7))
    const n = Number(day[1])
    const thisMonth = isValidDay(Number(today.slice(0, 4)), month, n)
      ? iso(Number(today.slice(0, 4)), month, n)
      : null
    if (thisMonth && thisMonth <= today) return { start: i, length: 1, date: thisMonth }
    const prev = fromISODate(`${today.slice(0, 7)}-01`)
    prev.setMonth(prev.getMonth() - 1)
    if (isValidDay(prev.getFullYear(), prev.getMonth() + 1, n))
      return { start: i, length: 1, date: iso(prev.getFullYear(), prev.getMonth() + 1, n) }
  }

  // "5/11" or "5/11/2026" (day first, as written in India)
  const numeric = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/.exec(w(0))
  if (numeric) {
    const [, d, m, y] = numeric
    if (y) {
      const year = y.length === 2 ? 2000 + Number(y) : Number(y)
      if (isValidDay(year, Number(m), Number(d)))
        return { start: i, length: 1, date: iso(year, Number(m), Number(d)) }
    } else {
      const date = pastDayOfMonth(today, Number(m), Number(d))
      if (date) return { start: i, length: 1, date }
    }
  }
  return null
}

/** Finds the first date expression, marks its words used, and returns the date ('YYYY-MM-DD'). */
export function extractDate(tokens: Token[], today: string): string | null {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i]!.used) continue
    const match = matchAt(tokens, i, today)
    if (!match) continue
    markUsed(tokens, match.start, match.length)
    // Up to two lead words: "on the 5th", "last friday".
    if (consumePreceding(tokens, match.start, LEAD_WORDS)) {
      consumePreceding(tokens, match.start - 1, LEAD_WORDS)
    }
    return match.date
  }
  return null
}

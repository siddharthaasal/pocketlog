/**
 * Dates are stored as local calendar dates ('YYYY-MM-DD') and months as 'YYYY-MM'.
 * Strings sort chronologically and never shift across time zones.
 */

const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromISODate(date: string): Date {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayISO(now = new Date()): string {
  return toISODate(now)
}

export function addDays(date: string, days: number): string {
  const d = fromISODate(date)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

export function monthOf(date: string): string {
  return date.slice(0, 7)
}

export function currentMonth(now = new Date()): string {
  return monthOf(toISODate(now))
}

export function shiftMonth(month: string, delta: number): string {
  const [y = 0, m = 1] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** Inclusive bounds usable for string range queries on 'YYYY-MM-DD'. */
export function monthBounds(month: string): [start: string, end: string] {
  return [`${month}-01`, `${month}-31`]
}

export function formatMonth(month: string): string {
  return fromISODate(`${month}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

export function formatDayHeading(date: string, today = todayISO()): string {
  if (date === today) return 'Today'
  if (date === addDays(today, -1)) return 'Yesterday'
  const d = fromISODate(date)
  const sameYear = date.slice(0, 4) === today.slice(0, 4)
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

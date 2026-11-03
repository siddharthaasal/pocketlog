import { fromISODate, toISODate } from './dates'

/** Whole days between an ISO timestamp and now, by local calendar date. */
export function daysSince(timestamp: string, now = new Date()): number {
  const then = fromISODate(toISODate(new Date(timestamp)))
  const today = fromISODate(toISODate(now))
  return Math.round((today.getTime() - then.getTime()) / 86_400_000)
}

export function describeDaysAgo(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

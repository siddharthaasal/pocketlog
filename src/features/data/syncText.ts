import type { LastSync } from '../../data/backup'
import { daysSince, describeDaysAgo } from '../../lib/relative'

const fromWhere = (device: string) =>
  device === 'another device' ? 'from another device' : `from your ${device}`

/** "Last synced 4 days ago, from your Mac (file made 5 days ago)." */
export function describeSync(sync: LastSync, now = new Date()): string {
  const merged = daysSince(sync.at, now)
  const made = sync.exportedAt ? daysSince(sync.exportedAt, now) : null
  return (
    `Last synced ${describeDaysAgo(merged)}` +
    (sync.from ? `, ${fromWhere(sync.from)}` : '') +
    (made !== null && made !== merged ? ` (file made ${describeDaysAgo(made)})` : '') +
    '.'
  )
}

/** A few words for the Settings row: the latest of a sync or a backup. */
export function shortStatus(sync: LastSync | undefined, backupAt: string | undefined): string {
  if (sync) return `Synced ${describeDaysAgo(daysSince(sync.at))}`
  if (backupAt) return `Backed up ${describeDaysAgo(daysSince(backupAt))}`
  return ''
}

import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'wouter'
import { LAST_BACKUP_KEY } from '../../data/backup'
import { db } from '../../data/db'
import { useMeta } from '../../data/hooks'
import { daysSince, describeDaysAgo } from '../../lib/relative'

/** Browser storage can be cleared by iOS; nudge for a backup once a week. */
export const BACKUP_REMINDER_DAYS = 7

export function BackupReminder() {
  const meta = useMeta<string>(LAST_BACKUP_KEY)
  const count = useLiveQuery(() => db.transactions.count())
  if (!meta || !count) return null
  const last = meta.value
  const days = last ? daysSince(last) : null
  if (days !== null && days < BACKUP_REMINDER_DAYS) return null

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-5 py-3.5">
      <p className="flex-1 text-[14px]">
        {days === null
          ? 'Your data only lives on this device. Make a backup.'
          : `Last backup ${describeDaysAgo(days)}.`}
      </p>
      <Link href="/settings/data" className="text-[15px] font-medium text-accent">
        Back up
      </Link>
    </div>
  )
}

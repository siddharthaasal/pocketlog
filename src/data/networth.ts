import type { Lines } from '../domain/networth'
import { netWorthSnapshotSchema, type NetWorthSnapshot } from '../domain/types'
import { nowISO } from '../lib/ids'
import { db } from './db'
import { useMeta } from './hooks'
import { removeRecord, saveRecord } from './records'

const INVESTED_BEFORE_KEY = 'networth.investedBefore'

/**
 * Closes a month: freezes its figures. The id is the month, so closing again replaces it
 * rather than adding a second copy.
 */
export function saveSnapshot(
  month: string,
  lines: Lines,
  totalInvested: number,
): Promise<NetWorthSnapshot> {
  return saveRecord(
    db.snapshots,
    netWorthSnapshotSchema,
    { month, lines, totalInvested, closedAt: nowISO() },
    month,
  )
}

/** Reopens a month by deleting its snapshot. */
export function reopenMonth(month: string): Promise<void> {
  return removeRecord(db.snapshots, month)
}

/** What you had invested before you started tracking, in paise. */
export async function saveInvestedBefore(paise: number): Promise<void> {
  await db.meta.put({ key: INVESTED_BEFORE_KEY, value: paise })
}

export function useInvestedBefore(): number | undefined {
  const meta = useMeta<number>(INVESTED_BEFORE_KEY)
  return meta ? (meta.value ?? 0) : undefined
}

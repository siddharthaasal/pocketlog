import { nextRenewalAfter, type RecurringSuggestion } from '../domain/recurring'
import {
  subscriptionSchema,
  type Subscription,
  type SubscriptionKind,
  type SubscriptionStatus,
} from '../domain/types'
import { nowISO } from '../lib/ids'
import { db } from './db'
import { useMeta } from './hooks'
import { removeRecord, saveRecord } from './records'

const IGNORE_KEY = 'subscriptions.ignore'

export type SubscriptionInput = Pick<Subscription, 'service' | 'kind' | 'cost' | 'billing'> &
  Partial<Pick<Subscription, 'nextRenewal' | 'accountId' | 'payeeKey' | 'notes'>>

/** Pass `id` to edit. New subscriptions start active. */
export function saveSubscription(
  input: SubscriptionInput,
  id?: string,
  status: SubscriptionStatus = 'active',
): Promise<Subscription> {
  return saveRecord(db.subscriptions, subscriptionSchema, { status, ...input }, id)
}

export function setSubscriptionStatus(id: string, status: SubscriptionStatus) {
  return saveRecord(db.subscriptions, subscriptionSchema, { status }, id)
}

export function removeSubscription(id: string): Promise<void> {
  return removeRecord(db.subscriptions, id)
}

/** Links charges to a subscription and moves its next renewal past the latest one. */
export async function linkCharges(subscriptionId: string, transactionIds: readonly string[]) {
  await db.transaction('rw', [db.transactions, db.subscriptions], async () => {
    const sub = await db.subscriptions.get(subscriptionId)
    if (!sub || sub.deletedAt) throw new Error('This subscription no longer exists.')
    const now = nowISO()
    let latest = ''
    for (const id of transactionIds) {
      const t = await db.transactions.get(id)
      if (!t || t.deletedAt) continue
      await db.transactions.update(id, { subscriptionId, updatedAt: now })
      if (t.date > latest) latest = t.date
    }
    if (latest) {
      const next = nextRenewalAfter(latest, sub.billing, latest)
      if (!sub.nextRenewal || next > sub.nextRenewal) {
        await db.subscriptions.update(subscriptionId, { nextRenewal: next, updatedAt: now })
      }
    }
  })
}

/** Turns a detected pattern into a subscription and links the charges it was found from. */
export async function addFromSuggestion(
  s: RecurringSuggestion,
  kind: SubscriptionKind = 'other',
): Promise<Subscription> {
  const last = await db.transactions.get(s.transactionIds[s.transactionIds.length - 1]!)
  const sub = await saveSubscription({
    service: s.name,
    kind,
    cost: s.cost,
    billing: s.billing,
    nextRenewal: s.nextRenewal,
    payeeKey: s.payeeKey,
    ...(last?.accountId && { accountId: last.accountId }),
  })
  await linkCharges(sub.id, s.transactionIds)
  return sub
}

async function ignored(): Promise<string[]> {
  return ((await db.meta.get(IGNORE_KEY))?.value as string[] | undefined) ?? []
}

export async function ignoreRecurring(key: string): Promise<void> {
  const current = await ignored()
  if (!current.includes(key)) await db.meta.put({ key: IGNORE_KEY, value: [...current, key] })
}

export async function unignoreRecurring(key: string): Promise<void> {
  await db.meta.put({ key: IGNORE_KEY, value: (await ignored()).filter((k) => k !== key) })
}

export function useIgnoredRecurring(): string[] | undefined {
  const meta = useMeta<string[]>(IGNORE_KEY)
  return meta ? (meta.value ?? []) : undefined
}

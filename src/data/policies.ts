import { advanceRenewal } from '../domain/recurring'
import { policySchema, type Policy, type PolicyStatus } from '../domain/types'
import { db } from './db'
import { removeRecord, saveRecord } from './records'

export type PolicyInput = Pick<Policy, 'name' | 'kind' | 'insurer' | 'premium' | 'frequency'> &
  Partial<
    Pick<Policy, 'sumAssured' | 'renewalDate' | 'nominee' | 'accountId' | 'payeeKey' | 'notes'>
  >

/** Pass `id` to edit. New policies start active. */
export function savePolicy(
  input: PolicyInput,
  id?: string,
  status: PolicyStatus = 'active',
): Promise<Policy> {
  return saveRecord(db.policies, policySchema, { status, ...input }, id)
}

export function setPolicyStatus(id: string, status: PolicyStatus): Promise<Policy> {
  return saveRecord(db.policies, policySchema, { status }, id)
}

export function removePolicy(id: string): Promise<void> {
  return removeRecord(db.policies, id)
}

/** The premium is paid: move the renewal date to the next one after `paidOn`. */
export async function markRenewed(id: string, paidOn: string): Promise<void> {
  const policy = await db.policies.get(id)
  if (!policy || policy.deletedAt) throw new Error('This policy no longer exists.')
  await saveRecord(
    db.policies,
    policySchema,
    { renewalDate: advanceRenewal(policy.renewalDate ?? paidOn, policy.frequency, paidOn) },
    id,
  )
}

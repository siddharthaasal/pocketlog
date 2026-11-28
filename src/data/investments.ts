import {
  allocationGroupSchema,
  DEFAULT_ASSET_CLASS,
  holdingSchema,
  valuationSchema,
  type Holding,
  type HoldingKind,
  type Valuation,
} from '../domain/types'
import { allocationProblem, type GroupDraft } from '../domain/investments'
import { ValidationError } from '../domain/errors'
import { db } from './db'
import { monthRowId, removeRecord, saveRecord } from './records'

export type HoldingInput = Pick<Holding, 'name' | 'kind' | 'assetClass'> &
  Partial<
    Pick<
      Holding,
      | 'platform'
      | 'accountId'
      | 'groupId'
      | 'emergency'
      | 'isin'
      | 'folio'
      | 'interestRate'
      | 'maturityDate'
      | 'notes'
    >
  >

/** Pass `id` to edit. New holdings start active. */
export function saveHolding(input: HoldingInput, id?: string): Promise<Holding> {
  return saveRecord(db.holdings, holdingSchema, { archived: false, ...input }, id)
}

export function setHoldingArchived(id: string, archived: boolean): Promise<Holding> {
  return saveRecord(db.holdings, holdingSchema, { archived }, id)
}

/** Moves a holding into an allocation group, or out of every group with `undefined`. */
export function setHoldingGroup(id: string, groupId: string | undefined): Promise<Holding> {
  return saveRecord(db.holdings, holdingSchema, { groupId }, id)
}

export const defaultAssetClass = (kind: HoldingKind) => DEFAULT_ASSET_CLASS[kind]

/** One valuation per holding per month: saving again replaces it. */
export function saveValuation(
  holdingId: string,
  month: string,
  invested: number,
  value: number,
): Promise<Valuation> {
  return saveRecord(
    db.valuations,
    valuationSchema,
    { holdingId, month, invested, value },
    monthRowId('val', holdingId, month),
  )
}

/** Saves several valuations together, or none. */
export async function saveValuations(
  month: string,
  entries: readonly { holdingId: string; invested: number; value: number }[],
): Promise<void> {
  await db.transaction('rw', db.valuations, async () => {
    for (const e of entries) await saveValuation(e.holdingId, month, e.invested, e.value)
  })
}

export function deleteValuation(id: string): Promise<void> {
  return removeRecord(db.valuations, id)
}

/**
 * Saves the Allocation table as edited: groups in this order, new ones added, and any group
 * left out deleted. Holdings in a deleted group fall back to "No group".
 */
export async function saveAllocation(drafts: readonly GroupDraft[]): Promise<void> {
  const problem = allocationProblem(drafts)
  if (problem) throw new ValidationError({ form: problem })
  await db.transaction('rw', db.allocationGroups, async () => {
    const kept = new Set(drafts.map((d) => d.id))
    for (const g of await db.allocationGroups.toArray()) {
      if (!g.deletedAt && !kept.has(g.id)) await removeRecord(db.allocationGroups, g.id)
    }
    for (const [order, d] of drafts.entries()) {
      await saveRecord(
        db.allocationGroups,
        allocationGroupSchema,
        { name: d.name, target: d.target, order },
        d.id,
      )
    }
  })
}

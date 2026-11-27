import {
  DEFAULT_ASSET_CLASS,
  holdingSchema,
  valuationSchema,
  type Holding,
  type HoldingKind,
  type Valuation,
} from '../domain/types'
import { DEFAULT_TARGETS, type Targets } from '../domain/investments'
import { db } from './db'
import { useMeta } from './hooks'
import { monthRowId, removeRecord, saveRecord } from './records'

const TARGETS_KEY = 'allocation.targets'

export type HoldingInput = Pick<Holding, 'name' | 'kind' | 'assetClass'> &
  Partial<Pick<Holding, 'platform' | 'accountId' | 'interestRate' | 'maturityDate' | 'notes'>>

/** Pass `id` to edit. New holdings start active. */
export function saveHolding(input: HoldingInput, id?: string): Promise<Holding> {
  return saveRecord(db.holdings, holdingSchema, { archived: false, ...input }, id)
}

export function setHoldingArchived(id: string, archived: boolean): Promise<Holding> {
  return saveRecord(db.holdings, holdingSchema, { archived }, id)
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

export async function saveTargets(targets: Targets): Promise<void> {
  await db.meta.put({ key: TARGETS_KEY, value: targets })
}

/** Target mix in basis points, with defaults for anything not set. */
export function useTargets(): Targets | undefined {
  const meta = useMeta<Partial<Targets>>(TARGETS_KEY)
  return meta ? { ...DEFAULT_TARGETS, ...meta.value } : undefined
}

import { holdingSchema } from '../domain/types'
import { parseGrowwHoldings, type GrowwResult, type ImportedHolding } from '../parser/groww'
import { db } from './db'
import { saveHolding, saveValuation } from './investments'
import { saveRecord } from './records'
import { readSheetGrid } from './spreadsheet'

/** Reads a Groww holdings report (.xlsx, or .csv saved from it). */
export async function readGrowwFile(file: File): Promise<GrowwResult> {
  try {
    const grid = await readSheetGrid(file, true)
    if (!grid) return { ok: false, message: 'This file has no sheets.' }
    return parseGrowwHoldings(grid)
  } catch (error) {
    return { ok: false, message: `Couldn’t open this file: ${(error as Error).message}` }
  }
}

export interface ImportChoice {
  row: ImportedHolding
  /** 'YYYY-MM', from the report's date. */
  month: string
  /** A holding id, a new holding, or leave this row out. */
  target: string | 'new' | 'skip'
}

/**
 * Saves an import, all or nothing: each row's invested and worth become that month's
 * valuation (replacing one already there), new holdings are created, and holdings are linked
 * by ISIN or folio so the next import finds them without asking.
 */
export async function saveHoldingImport(
  choices: readonly ImportChoice[],
): Promise<{ created: number; saved: number }> {
  let created = 0
  let saved = 0
  await db.transaction('rw', db.holdings, db.valuations, async () => {
    for (const { row, month, target } of choices) {
      if (target === 'skip') continue
      const link = { ...(row.isin && { isin: row.isin }), ...(row.folio && { folio: row.folio }) }
      let holdingId = target
      if (target === 'new') {
        const h = await saveHolding({
          name: row.name,
          kind: row.kind,
          assetClass: row.assetClass,
          platform: 'Groww',
          ...link,
        })
        holdingId = h.id
        created++
      } else {
        const h = await db.holdings.get(target)
        if (!h || h.deletedAt)
          throw new Error(`“${row.name}” points at a holding that no longer exists.`)
        if (h.isin !== link.isin || h.folio !== link.folio) {
          await saveRecord(db.holdings, holdingSchema, link, target)
        }
      }
      await saveValuation(holdingId, month, row.invested, row.value)
      saved++
    }
  })
  return { created, saved }
}

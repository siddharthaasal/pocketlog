import { looksLikeEmailSweep, parseEmailSweep, type ParsedEmailSweep } from '../parser/emailSweep'
import { parseCsv, parseStatementGrid, type ParsedStatement } from '../parser/statement'

export type ReconcileFile =
  { kind: 'bank'; statement: ParsedStatement } | { kind: 'email'; sweep: ParsedEmailSweep }

export type ReconcileFileResult = { ok: true; file: ReconcileFile } | { ok: false; message: string }

/**
 * Reads a file dropped on the Reconcile screen: a bank statement, or the text file the email
 * sweep writes. Spreadsheets (.xls/.xlsx) go through SheetJS, which is loaded only when one is
 * actually opened so it never weighs down the rest of the app.
 */
export async function readReconcileFile(file: File): Promise<ReconcileFileResult> {
  try {
    if (/\.(csv|txt|log)$/i.test(file.name)) {
      const text = await file.text()
      if (looksLikeEmailSweep(text)) {
        const result = parseEmailSweep(text)
        return result.ok
          ? { ok: true, file: { kind: 'email', sweep: result.sweep } }
          : { ok: false, message: result.message }
      }
      const result = parseStatementGrid(parseCsv(text))
      return result.ok
        ? { ok: true, file: { kind: 'bank', statement: result.statement } }
        : { ok: false, message: result.message }
    }
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]!]
    if (!sheet) return { ok: false, message: 'This file has no sheets.' }
    const grid = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    })
    const result = parseStatementGrid(grid)
    return result.ok
      ? { ok: true, file: { kind: 'bank', statement: result.statement } }
      : { ok: false, message: result.message }
  } catch (error) {
    return { ok: false, message: `Couldn’t open this file: ${(error as Error).message}` }
  }
}

import { parseCsv, parseStatementGrid, type StatementResult } from '../parser/statement'

/**
 * Reads a bank statement file in the browser. Spreadsheets (.xls/.xlsx) go through SheetJS,
 * which is loaded only when one is actually opened so it never weighs down the rest of the app.
 */
export async function readStatementFile(file: File): Promise<StatementResult> {
  try {
    if (/\.(csv|txt)$/i.test(file.name)) {
      return parseStatementGrid(parseCsv(await file.text()))
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
    return parseStatementGrid(grid)
  } catch (error) {
    return { ok: false, message: `Couldn’t open this file: ${(error as Error).message}` }
  }
}

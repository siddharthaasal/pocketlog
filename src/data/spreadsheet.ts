export type Cell = string | number

/**
 * The first sheet of a spreadsheet as rows of cells. SheetJS is loaded only when a file is
 * actually opened, so it never weighs down the rest of the app. `raw` keeps numbers as numbers
 * rather than as the text the sheet displays.
 */
export async function readSheetGrid(file: File, raw: boolean): Promise<Cell[][] | null> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]
  if (!sheet) return null
  return XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw, defval: '', blankrows: false })
}

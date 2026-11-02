/** All money is stored as integer paise to avoid floating-point drift. */

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/

/** Parses user input like "350", "1,200.5" or "₹ 99.99" into paise. Returns null if invalid. */
export function parseRupees(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '')
  if (!AMOUNT_PATTERN.test(cleaned)) return null
  const [rupees = '0', fraction = ''] = cleaned.split('.')
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(paise) ? paise : null
}

/** Formats paise for an editable input: 35000 → "350", 35050 → "350.50". */
export function paiseToInput(paise: number): string {
  const abs = Math.abs(paise)
  const rupees = Math.floor(abs / 100)
  const rest = abs % 100
  const sign = paise < 0 ? '-' : ''
  return rest === 0 ? `${sign}${rupees}` : `${sign}${rupees}.${String(rest).padStart(2, '0')}`
}

const wholeFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})
const fractionFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** 3500000 → "₹35,000"; 35050 → "₹350.50" (Indian digit grouping). */
export function formatINR(paise: number): string {
  const formatter = paise % 100 === 0 ? wholeFormatter : fractionFormatter
  return formatter.format(paise / 100)
}

import { useSearchParams } from 'wouter'
import { currentMonth } from '../../lib/dates'

const MONTH_PATTERN = /^\d{4}-\d{2}$/

/** The selected month lives in the URL (?month=YYYY-MM) so it survives navigating away and back. */
export function useMonthParam(): [string, (month: string) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get('month')
  const month = raw && MONTH_PATTERN.test(raw) ? raw : currentMonth()
  const setMonth = (next: string) =>
    setParams(next === currentMonth() ? {} : { month: next }, { replace: true })
  return [month, setMonth]
}

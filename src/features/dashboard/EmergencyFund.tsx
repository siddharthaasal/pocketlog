import { Link } from 'wouter'
import { Card, Money } from '../../components/ui'
import {
  useAccounts,
  useAllTransactions,
  useBalances,
  useHoldings,
  useValuations,
} from '../../data/hooks'
import { useEmergencyTarget } from '../../data/networth'
import {
  EMERGENCY_LOOKBACK,
  emergencyCover,
  emergencyHoldings,
  savingsBalance,
} from '../../domain/budgets'
import { holdingRows } from '../../domain/investments'
import { currentMonth } from '../../lib/dates'
import { BudgetBar } from '../budgets/BudgetBar'

const monthsText = (n: number) => `${n.toFixed(1)} ${n >= 0.95 && n < 1.05 ? 'month' : 'months'}`

/**
 * How long your savings would last at your usual spending, against the target you chose.
 * Holdings marked as emergency money, like a liquid fund, count alongside the savings accounts.
 */
export function EmergencyFund() {
  const accounts = useAccounts()
  const balances = useBalances()
  const transactions = useAllTransactions()
  const holdings = useHoldings()
  const valuations = useValuations()
  const target = useEmergencyTarget()
  if (!accounts || !balances || !transactions || !holdings || !valuations || target === undefined) {
    return null
  }

  const savings = savingsBalance(accounts, balances)
  const kept = emergencyHoldings(holdingRows(holdings, valuations))
  const inHoldings = kept.reduce((sum, r) => sum + r.value, 0)
  const cover = emergencyCover(savings + inHoldings, transactions, currentMonth())
  if (cover.months === null) return null
  const reached = cover.months >= target
  // An estimate, so whole rupees.
  const short = Math.ceil(Math.max(0, target * cover.monthlySpend - cover.savings) / 100) * 100

  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[13px] font-medium text-muted">Emergency fund</div>
        <Link href="/settings" className="text-[13px] text-muted hover:text-text">
          Target {target} months
        </Link>
      </div>
      <div className="mt-1 text-[28px] leading-none font-semibold tracking-tight tabular-nums">
        {monthsText(cover.months)}
      </div>
      <BudgetBar used={cover.months / target} status="ok" className="mt-4" />
      <p className="mt-3 text-[13px] text-muted">
        <Money paise={savings} /> in savings
        {kept.length > 0 && (
          <>
            {' '}
            and <Money paise={inHoldings} /> in{' '}
            {kept.length === 1 ? kept[0]!.holding.name : `${kept.length} emergency holdings`}
          </>
        )}
        , against <Money paise={cover.monthlySpend} /> spent in an average month (last{' '}
        {cover.monthsUsed === 1 ? 'month' : `${cover.monthsUsed} months`}
        {cover.monthsUsed < EMERGENCY_LOOKBACK ? ' so far' : ''}).{' '}
        {reached ? (
          'Target reached.'
        ) : (
          <>
            About <Money paise={short} /> more reaches the target.
          </>
        )}
      </p>
    </Card>
  )
}

import type { Account, AccountBalance, Transaction } from './types'

/**
 * Current balance of every account, in paise:
 * opening + income in − expenses out − transfers out + transfers in.
 * Credit cards go negative as you spend (money owed).
 */
export function accountBalances(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
): Map<string, number> {
  const balances = new Map(accounts.map((a) => [a.id, a.openingBalance]))
  const add = (id: string | undefined, delta: number) => {
    if (id === undefined) return
    const current = balances.get(id)
    if (current !== undefined) balances.set(id, current + delta)
  }

  for (const t of transactions) {
    if (t.deletedAt) continue
    switch (t.type) {
      case 'expense':
        add(t.accountId, -t.amount)
        break
      case 'income':
        add(t.accountId, t.amount)
        break
      case 'transfer':
        add(t.accountId, -t.amount)
        add(t.toAccountId, t.amount)
        break
    }
  }
  return balances
}

/** Sum across all accounts, including archived ones: archiving doesn't make money disappear. */
export function totalBalance(balances: ReadonlyMap<string, number>): number {
  let total = 0
  for (const value of balances.values()) total += value
  return total
}

/** Balance of one account at the end of `date`, from its opening balance and transactions up to then. */
export function balanceOn(
  account: Account,
  transactions: readonly Transaction[],
  date: string,
): number {
  const upTo = transactions.filter((t) => t.date <= date)
  return accountBalances([account], upTo).get(account.id) ?? account.openingBalance
}

export interface Drift {
  accountId: string
  date: string
  /** What the statement says. */
  statement: number
  /** What PocketLog works out for the same day. */
  computed: number
  /** computed − statement. Positive: PocketLog shows more money than the bank. */
  difference: number
}

/**
 * Compares each account's latest statement balance with the balance worked out from
 * transactions on the same date. Only differences are returned.
 */
export function findDrift(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  checkpoints: readonly AccountBalance[],
): Drift[] {
  const latest = new Map<string, AccountBalance>()
  for (const c of checkpoints) {
    if (c.deletedAt) continue
    const current = latest.get(c.accountId)
    if (!current || c.date > current.date) latest.set(c.accountId, c)
  }
  const drifts: Drift[] = []
  for (const account of accounts) {
    const checkpoint = latest.get(account.id)
    if (!checkpoint || (account.openingDate && checkpoint.date < account.openingDate)) continue
    const computed = balanceOn(account, transactions, checkpoint.date)
    if (computed !== checkpoint.balance) {
      drifts.push({
        accountId: account.id,
        date: checkpoint.date,
        statement: checkpoint.balance,
        computed,
        difference: computed - checkpoint.balance,
      })
    }
  }
  return drifts
}

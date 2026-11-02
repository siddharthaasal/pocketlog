import type { Account, Transaction } from './types'

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

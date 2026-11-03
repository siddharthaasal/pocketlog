import type { Account } from './types'

/** The account new transactions start with: the marked default, else the first active one. */
export function pickDefaultAccount(accounts: readonly Account[]): Account | undefined {
  const active = accounts.filter((a) => !a.archived && !a.deletedAt)
  return active.find((a) => a.isDefault) ?? active[0]
}

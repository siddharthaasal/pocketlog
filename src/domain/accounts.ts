import type { Account } from './types'

/** The account new transactions start with: the marked default, else the first active one. */
export function pickDefaultAccount(accounts: readonly Account[]): Account | undefined {
  const active = accounts.filter((a) => !a.archived && !a.deletedAt)
  return active.find((a) => a.isDefault) ?? active[0]
}

/**
 * After merging two devices there may be two defaults; keep the most recently changed one.
 * Returns the accounts whose flag must be cleared.
 */
export function extraDefaults(accounts: readonly Account[]): Account[] {
  const defaults = accounts
    .filter((a) => a.isDefault && !a.archived && !a.deletedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return defaults.slice(1)
}

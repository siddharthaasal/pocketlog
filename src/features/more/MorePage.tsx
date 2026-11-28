import {
  AccountsIcon,
  BudgetsIcon,
  MicIcon,
  ReconcileIcon,
  SettingsIcon,
} from '../../components/icons'
import { Card, PageHeader } from '../../components/ui'
import { useAccounts } from '../../data/hooks'
import { SettingsRow } from '../settings/SettingsList'

/** The phone's More tab: the pages its tab bar has no room for. The sidebar lists them on a Mac. */
export function MorePage() {
  const accounts = useAccounts()
  const icon = (Glyph: typeof AccountsIcon) => (
    <Glyph width={20} height={20} className="text-muted" aria-hidden="true" />
  )
  return (
    <>
      <PageHeader title="More" />
      <Card className="divide-y divide-border overflow-hidden">
        <SettingsRow
          href="/accounts"
          leading={icon(AccountsIcon)}
          title="Accounts"
          detail={accounts ? accounts.filter((a) => !a.archived).length : ''}
        />
        <SettingsRow href="/budgets" leading={icon(BudgetsIcon)} title="Budgets" />
        <SettingsRow
          href="/reconcile"
          leading={icon(ReconcileIcon)}
          title="Reconcile bank statement"
        />
        <SettingsRow href="/inbox" leading={icon(MicIcon)} title="Siri inbox" />
        <SettingsRow href="/settings" leading={icon(SettingsIcon)} title="Settings" />
      </Card>
    </>
  )
}

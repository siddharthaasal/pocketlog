import { Link } from 'wouter'
import { Card, Loading, PageHeader, SectionTitle } from '../../components/ui'
import { useAccounts } from '../../data/hooks'
import { ACCOUNT_TYPE_LABELS, type Account } from '../../domain/types'
import { SettingsRow } from './SettingsList'

export function AccountsPage() {
  const accounts = useAccounts()
  const active = accounts?.filter((a) => !a.archived) ?? []
  const archived = accounts?.filter((a) => a.archived) ?? []

  const row = (a: Account, muted = false) => (
    <SettingsRow
      key={a.id}
      href={`/settings/accounts/${a.id}`}
      title={
        <span className={muted ? 'text-muted' : undefined}>
          {a.name}
          {a.isDefault && <span className="ml-2 text-[13px] text-accent">Default</span>}
        </span>
      }
      detail={ACCOUNT_TYPE_LABELS[a.type]}
    />
  )

  return (
    <>
      <PageHeader
        title="Accounts"
        back="/settings"
        action={
          <Link href="/settings/accounts/new" className="text-[15px] font-medium text-accent">
            New
          </Link>
        }
      />
      {!accounts ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          <Card className="divide-y divide-border overflow-hidden">
            {active.map((a) => row(a))}
          </Card>
          {archived.length > 0 && (
            <section>
              <SectionTitle>Archived</SectionTitle>
              <Card className="divide-y divide-border overflow-hidden">
                {archived.map((a) => row(a, true))}
              </Card>
            </section>
          )}
        </div>
      )}
    </>
  )
}

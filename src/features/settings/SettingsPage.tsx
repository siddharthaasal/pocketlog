import { useEffect, useState } from 'react'
import { Card, PageHeader, Segmented, SectionTitle } from '../../components/ui'
import { useAccounts, useCategories } from '../../data/hooks'
import { isStoragePersistent, requestPersistentStorage } from '../../data/storage'
import { THEME_OPTIONS, setThemePreference, useThemePreference } from '../../lib/theme'
import { SettingsRow } from './SettingsList'

export function SettingsPage() {
  const categories = useCategories()
  const accounts = useAccounts()
  const [persistent, setPersistent] = useState<boolean | null>(null)
  const theme = useThemePreference()

  useEffect(() => {
    void isStoragePersistent().then(setPersistent)
  }, [])

  const activeCount = (rows: { archived: boolean }[] | undefined) =>
    rows ? rows.filter((r) => !r.archived).length : ''

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        <section>
          <SectionTitle>Manage</SectionTitle>
          <Card className="divide-y divide-border overflow-hidden">
            <SettingsRow
              href="/settings/categories"
              title="Categories"
              detail={activeCount(categories)}
            />
            <SettingsRow
              href="/settings/accounts"
              title="Accounts"
              detail={activeCount(accounts)}
            />
            <SettingsRow href="/inbox" title="Siri inbox" />
            <SettingsRow href="/reconcile" title="Reconcile bank statement" />
          </Card>
        </section>

        <section>
          <SectionTitle>Preferences</SectionTitle>
          <Card className="divide-y divide-border overflow-hidden">
            <SettingsRow title="Currency" detail="₹ INR" />
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-[15px]">Appearance</span>
              <div className="w-56">
                <Segmented value={theme} options={THEME_OPTIONS} onChange={setThemePreference} />
              </div>
            </div>
          </Card>
          <p className="mt-2 px-1 text-[13px] text-muted">
            System follows your device. The choice is kept on this device only.
          </p>
        </section>

        <section>
          <SectionTitle>Your data</SectionTitle>
          <Card className="divide-y divide-border overflow-hidden">
            <SettingsRow href="/settings/data" title="Backup & sync" />
            <SettingsRow href="/settings/privacy" title="Privacy" />
          </Card>
        </section>

        <section>
          <SectionTitle>Storage</SectionTitle>
          <Card className="divide-y divide-border overflow-hidden">
            <SettingsRow
              title="Protected from eviction"
              detail={
                persistent === null ? (
                  'Unsupported'
                ) : persistent ? (
                  'Yes'
                ) : (
                  <button
                    type="button"
                    className="text-accent"
                    onClick={() => void requestPersistentStorage().then(setPersistent)}
                  >
                    Request
                  </button>
                )
              }
            />
          </Card>
          <p className="mt-2 px-1 text-[13px] text-muted">
            Your data is stored only on this device. Nothing is sent to a server.
          </p>
        </section>
      </div>
    </>
  )
}

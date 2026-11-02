import { useEffect, useState } from 'react'
import { Card, PageHeader, SectionTitle } from '../../components/ui'
import { useAccounts, useCategories } from '../../data/hooks'
import { isStoragePersistent, requestPersistentStorage } from '../../data/storage'
import { SettingsRow } from './SettingsList'

export function SettingsPage() {
  const categories = useCategories()
  const accounts = useAccounts()
  const [persistent, setPersistent] = useState<boolean | null>(null)

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
          </Card>
        </section>

        <section>
          <SectionTitle>Preferences</SectionTitle>
          <Card className="divide-y divide-border overflow-hidden">
            <SettingsRow title="Currency" detail="₹ INR" />
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

import { useEffect, useState } from 'react'
import { Card, PageHeader, Segmented, SectionTitle } from '../../components/ui'
import { LAST_BACKUP_KEY, LAST_SYNC_KEY, type LastSync } from '../../data/backup'
import { useCategories, useMeta } from '../../data/hooks'
import { shortStatus } from '../data/syncText'
import { isStoragePersistent, requestPersistentStorage } from '../../data/storage'
import {
  EMERGENCY_TARGET_OPTIONS,
  saveEmergencyTarget,
  useEmergencyTarget,
  type EmergencyTarget,
} from '../../data/networth'
import { THEME_OPTIONS, setThemePreference, useThemePreference } from '../../lib/theme'
import { SettingsRow } from './SettingsList'

export function SettingsPage() {
  const categories = useCategories()
  const [persistent, setPersistent] = useState<boolean | null>(null)
  const theme = useThemePreference()
  const emergencyTarget = useEmergencyTarget()
  const lastSync = useMeta<LastSync>(LAST_SYNC_KEY)
  const lastBackup = useMeta<string>(LAST_BACKUP_KEY)

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
            <SettingsRow href="/inbox" title="Siri inbox" />
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
          <Card className="mt-4 divide-y divide-border overflow-hidden">
            <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span className="text-[15px]">Emergency fund target</span>
              <div className="sm:w-80">
                {emergencyTarget !== undefined && (
                  <Segmented
                    value={String(emergencyTarget)}
                    options={EMERGENCY_TARGET_OPTIONS.map((n) => ({
                      value: String(n),
                      label: `${n} months`,
                    }))}
                    onChange={(v) => void saveEmergencyTarget(Number(v) as EmergencyTarget)}
                  />
                )}
              </div>
            </div>
          </Card>
          <p className="mt-2 px-1 text-[13px] text-muted">
            How many months of your usual spending your savings accounts should cover. Shown on
            Home.
          </p>
        </section>

        <section>
          <SectionTitle>Your data</SectionTitle>
          <Card className="divide-y divide-border overflow-hidden">
            <SettingsRow
              href="/settings/data"
              title="Backup & sync"
              detail={shortStatus(lastSync?.value, lastBackup?.value)}
            />
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

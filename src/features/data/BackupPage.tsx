import { useState, type ChangeEvent, type ReactNode } from 'react'
import { Button, Card, Field, PageHeader, SectionTitle, TextInput } from '../../components/ui'
import {
  LAST_BACKUP_KEY,
  applyMerge,
  deleteAllData,
  exportBackupText,
  exportCsvText,
  previewMerge,
  recordBackup,
  replaceAll,
} from '../../data/backup'
import { useAllTransactions, useMeta } from '../../data/hooks'
import { readBackupText, type BackupFile, type InvalidRow } from '../../domain/backup'
import type { MergeCounts, MergePlan } from '../../domain/merge'
import { todayISO } from '../../lib/dates'
import { formatBytes, saveFile } from '../../lib/files'
import { daysSince, describeDaysAgo } from '../../lib/relative'

const MIN_PASSPHRASE = 8

export function BackupPage() {
  return (
    <>
      <PageHeader title="Backup & sync" back="/settings" />
      <div className="space-y-8">
        <ExportSection />
        <ImportSection />
        <section>
          <SectionTitle>Syncing iPhone and Mac</SectionTitle>
          <Card className="space-y-2 p-5 text-[14px] text-muted">
            <p>
              Each device keeps its own copy. To sync, create a backup on one device, send it to the
              other (AirDrop or iCloud Drive), and choose <span className="text-text">Merge</span>{' '}
              there.
            </p>
            <p>
              Merging keeps the newest version of every entry and carries deletions across, so it’s
              safe to do in both directions and to repeat.
            </p>
          </Card>
        </section>
        <DeleteSection />
      </div>
    </>
  )
}

// ---------- Export ----------

interface Prepared {
  file: File
  isBackup: boolean
}

function ExportSection() {
  const lastBackup = useMeta<string>(LAST_BACKUP_KEY)
  const [protect, setProtect] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const passphraseError =
    protect && passphrase.length > 0 && passphrase.length < MIN_PASSPHRASE
      ? `Use at least ${MIN_PASSPHRASE} characters`
      : undefined
  const confirmError =
    protect && confirm.length > 0 && confirm !== passphrase ? 'Passphrases don’t match' : undefined
  const canCreate = !protect || (passphrase.length >= MIN_PASSPHRASE && confirm === passphrase)

  async function prepare(kind: 'backup' | 'csv') {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const date = todayISO()
      const file =
        kind === 'backup'
          ? new File(
              [await exportBackupText(protect ? passphrase : undefined)],
              `pocketlog-backup-${date}${protect ? '-encrypted' : ''}.json`,
              { type: 'application/json' },
            )
          : new File([await exportCsvText()], `pocketlog-transactions-${date}.csv`, {
              type: 'text/csv',
            })
      setPrepared({ file, isBackup: kind === 'backup' })
    } catch (e) {
      setError(`Couldn’t create the file: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!prepared) return
    try {
      const outcome = await saveFile(prepared.file)
      if (outcome === 'cancelled') return
      if (prepared.isBackup) await recordBackup()
      setMessage(outcome === 'shared' ? 'Shared.' : 'Downloaded.')
      setPrepared(null)
      setPassphrase('')
      setConfirm('')
    } catch (e) {
      setError(`Couldn’t save the file: ${(e as Error).message}`)
    }
  }

  const last = lastBackup?.value
  return (
    <section>
      <SectionTitle>Back up</SectionTitle>
      <Card className="space-y-4 p-5">
        <p className="text-[14px] text-muted">
          {lastBackup === undefined
            ? ' '
            : last
              ? `Last backup ${describeDaysAgo(daysSince(last))}.`
              : 'You haven’t made a backup on this device yet.'}
        </p>

        <label className="flex items-center justify-between gap-3">
          <span className="text-[15px]">Protect with a passphrase</span>
          <input
            type="checkbox"
            checked={protect}
            onChange={(e) => {
              setProtect(e.target.checked)
              setPrepared(null)
            }}
            className="h-5 w-5 accent-accent"
          />
        </label>
        {protect && (
          <div className="space-y-3">
            <Field label="Passphrase" error={passphraseError}>
              <TextInput
                type="password"
                autoComplete="new-password"
                value={passphrase}
                onChange={(e) => {
                  setPassphrase(e.target.value)
                  setPrepared(null)
                }}
              />
            </Field>
            <Field
              label="Repeat passphrase"
              error={confirmError}
              hint="If you forget it, the backup can’t be opened. There’s no reset."
            >
              <TextInput
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value)
                  setPrepared(null)
                }}
              />
            </Field>
          </div>
        )}

        {prepared ? (
          <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">{prepared.file.name}</p>
              <p className="text-[13px] text-muted">{formatBytes(prepared.file.size)}</p>
            </div>
            <Button variant="ghost" onClick={() => setPrepared(null)}>
              Cancel
            </Button>
            <Button onClick={() => void save()}>Save file</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="sm:flex-1"
              disabled={!canCreate || busy}
              onClick={() => void prepare('backup')}
            >
              {busy ? 'Creating…' : 'Create backup'}
            </Button>
            <Button
              variant="secondary"
              className="sm:flex-1"
              disabled={busy}
              onClick={() => void prepare('csv')}
            >
              Export CSV
            </Button>
          </div>
        )}
        <Status message={message} error={error} />
        <p className="text-[13px] text-muted">
          The backup holds everything, including deletions, and can be merged or restored. The CSV
          is for spreadsheets and can’t be imported back.
        </p>
      </Card>
    </section>
  )
}

// ---------- Import ----------

type ImportState =
  | { step: 'idle' }
  | { step: 'locked'; name: string; text: string; error?: string }
  | { step: 'preview'; name: string; backup: BackupFile; invalid: InvalidRow[]; plan: MergePlan }
  | {
      step: 'confirm-replace'
      name: string
      backup: BackupFile
      invalid: InvalidRow[]
      plan: MergePlan
    }

function ImportSection() {
  const [state, setState] = useState<ImportState>({ step: 'idle' })
  const [passphrase, setPassphrase] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function open(name: string, text: string, secret?: string) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await readBackupText(text, secret)
      if (result.status === 'needs-passphrase') {
        setState({ step: 'locked', name, text })
      } else if (result.status === 'error') {
        if (secret) setState({ step: 'locked', name, text, error: result.message })
        else {
          setState({ step: 'idle' })
          setError(result.message)
        }
      } else {
        const plan = await previewMerge(result.backup.data)
        setState({ step: 'preview', name, backup: result.backup, invalid: result.invalid, plan })
        setPassphrase('')
      }
    } finally {
      setBusy(false)
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) await open(file.name, await file.text())
  }

  async function merge(backup: BackupFile) {
    setBusy(true)
    try {
      const plan = await applyMerge(backup.data)
      const t = plan.counts.transactions
      setMessage(`Merged: ${t.added} new, ${t.updated} updated, ${t.deleted} deleted transactions.`)
      setState({ step: 'idle' })
    } catch (e) {
      setError(`Merge failed, nothing was changed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function replace(backup: BackupFile) {
    setBusy(true)
    try {
      await replaceAll(backup.data)
      setMessage('Restored. This device now matches the backup.')
      setState({ step: 'idle' })
    } catch (e) {
      setError(`Restore failed, nothing was changed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <SectionTitle>Merge or restore</SectionTitle>
      <Card className="space-y-4 p-5">
        {state.step === 'idle' && (
          <label
            className={`flex h-11 cursor-pointer items-center justify-center rounded-xl bg-surface-2 text-[15px] font-medium hover:opacity-80 ${busy ? 'pointer-events-none opacity-40' : ''}`}
          >
            {busy ? 'Reading…' : 'Choose a backup file'}
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(e) => void onFile(e)}
            />
          </label>
        )}

        {state.step === 'locked' && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void open(state.name, state.text, passphrase)
            }}
          >
            <p className="text-[14px]">
              <span className="font-medium">{state.name}</span> is protected with a passphrase.
            </p>
            <Field label="Passphrase" error={state.error}>
              <TextInput
                type="password"
                autoComplete="current-password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                autoFocus
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setState({ step: 'idle' })}>
                Cancel
              </Button>
              <Button type="submit" disabled={!passphrase || busy}>
                {busy ? 'Unlocking…' : 'Unlock'}
              </Button>
            </div>
          </form>
        )}

        {(state.step === 'preview' || state.step === 'confirm-replace') && (
          <div className="space-y-4">
            <div>
              <p className="text-[15px] font-medium">{state.name}</p>
              {state.backup.exportedAt && (
                <p className="text-[13px] text-muted">
                  Created{' '}
                  {new Date(state.backup.exportedAt).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
              )}
            </div>
            <div className="divide-y divide-border rounded-xl border border-border">
              <CountsRow label="Transactions" counts={state.plan.counts.transactions} />
              <CountsRow label="Categories" counts={state.plan.counts.categories} />
              <CountsRow label="Accounts" counts={state.plan.counts.accounts} />
            </div>
            {[...state.invalid, ...state.plan.invalid].length > 0 && (
              <div className="rounded-xl bg-surface-2 p-3 text-[13px]">
                <p className="font-medium text-negative">
                  {[...state.invalid, ...state.plan.invalid].length} rows can’t be used and will be
                  skipped:
                </p>
                <ul className="mt-1 space-y-0.5 text-muted">
                  {[...state.invalid, ...state.plan.invalid].slice(0, 5).map((row) => (
                    <li key={`${row.table}-${row.id}`}>
                      {row.table} {row.id.slice(0, 8)}: {row.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {state.step === 'preview' ? (
              <div className="flex flex-col gap-2">
                <Button disabled={busy} onClick={() => void merge(state.backup)}>
                  Merge into this device
                </Button>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => setState({ ...state, step: 'confirm-replace' })}
                >
                  Replace everything on this device…
                </Button>
                <Button variant="ghost" onClick={() => setState({ step: 'idle' })}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-negative/40 p-4">
                <p className="text-[14px]">
                  This deletes everything on this device and replaces it with the backup. Anything
                  added here since the backup was made will be lost.
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setState({ ...state, step: 'preview' })}>
                    Back
                  </Button>
                  <Button
                    className="bg-negative text-white"
                    disabled={busy}
                    onClick={() => void replace(state.backup)}
                  >
                    Replace everything
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        <Status message={message} error={error} />
      </Card>
    </section>
  )
}

function CountsRow({ label, counts }: { label: string; counts: MergeCounts }) {
  const parts = [
    counts.added > 0 && `${counts.added} new`,
    counts.updated > 0 && `${counts.updated} updated`,
    counts.deleted > 0 && `${counts.deleted} deleted`,
    counts.keptLocal > 0 && `${counts.keptLocal} newer here`,
    counts.unchanged > 0 && `${counts.unchanged} already here`,
  ].filter(Boolean)
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2.5 text-[14px]">
      <span>{label}</span>
      <span className="text-right text-muted tabular-nums">
        {parts.length > 0 ? parts.join(' · ') : 'none'}
      </span>
    </div>
  )
}

// ---------- Delete ----------

function DeleteSection() {
  const transactions = useAllTransactions()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function erase() {
    setBusy(true)
    await deleteAllData()
    window.location.assign('/')
  }

  return (
    <section>
      <SectionTitle>Delete data</SectionTitle>
      <Card className="space-y-3 p-5">
        {!confirming ? (
          <>
            <p className="text-[14px] text-muted">
              Erase every transaction, category and account on this device. Other devices and backup
              files aren’t affected.
            </p>
            <Button variant="danger" className="w-full" onClick={() => setConfirming(true)}>
              Delete all data on this device…
            </Button>
          </>
        ) : (
          <>
            <p className="text-[14px]">
              This permanently erases {transactions?.length ?? 'all'} transactions on this device.
              Create a backup first if you might want them back.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                className="bg-negative text-white"
                disabled={busy}
                onClick={() => void erase()}
              >
                Delete everything
              </Button>
            </div>
          </>
        )}
      </Card>
    </section>
  )
}

function Status({ message, error }: { message: string | null; error: string | null }): ReactNode {
  if (error)
    return (
      <p role="alert" className="text-[14px] text-negative">
        {error}
      </p>
    )
  if (message)
    return (
      <p role="status" className="text-[14px] text-positive">
        {message}
      </p>
    )
  return null
}

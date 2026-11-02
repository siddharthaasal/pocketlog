import { useState, type ChangeEvent } from 'react'
import { Link, useLocation } from 'wouter'
import { Button, Card, EmptyState, Loading, PageHeader, SectionTitle } from '../../components/ui'
import { useLookups, useReviewQueue, useUnparsedInbox } from '../../data/hooks'
import { dismissInboxEntry, importInboxFile, type ImportSummary } from '../../data/inbox'
import { confirmTransaction } from '../../data/repo'
import { formatDayHeading } from '../../lib/dates'
import { TransactionRow } from '../transactions/TransactionRow'
import { SiriSetupGuide } from './SiriSetupGuide'

export interface AddFromTextState {
  text: string
  inboxKey?: string
}

function describeSummary(s: ImportSummary): string {
  const parts = [
    s.added > 0 && `${s.added} added`,
    s.toReview > 0 && `${s.toReview} to review`,
    s.unreadable > 0 && `${s.unreadable} couldn’t be read`,
    s.alreadyImported > 0 && `${s.alreadyImported} already imported`,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'The file was empty.'
}

export function InboxPage() {
  const [, navigate] = useLocation()
  const review = useReviewQueue()
  const unparsed = useUnparsedInbox()
  const lookups = useLookups()
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [importing, setImporting] = useState(false)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow picking the same file again later
    if (!file) return
    setImporting(true)
    try {
      const summary = await importInboxFile(await file.text())
      setStatus({ ok: true, message: describeSummary(summary) })
    } catch (error) {
      setStatus({ ok: false, message: `Import failed: ${(error as Error).message}` })
    } finally {
      setImporting(false)
    }
  }

  const loading = !review || !unparsed || !lookups

  return (
    <>
      <PageHeader title="Siri inbox" />
      <div className="space-y-7">
        <Card className="space-y-3 p-5">
          <p className="text-[15px]">
            Expenses you log with Siri are saved to <span className="font-medium">inbox.txt</span>{' '}
            in Files. Import the file to add them here. Importing it again only adds new lines.
          </p>
          <label
            className={`flex h-12 cursor-pointer items-center justify-center rounded-xl bg-accent text-[15px] font-medium text-accent-fg hover:opacity-90 ${importing ? 'pointer-events-none opacity-40' : ''}`}
          >
            {importing ? 'Importing…' : 'Import inbox file'}
            <input type="file" accept=".txt,text/plain" className="sr-only" onChange={onFile} />
          </label>
          {status && (
            <p
              role="status"
              className={`text-[14px] ${status.ok ? 'text-muted' : 'text-negative'}`}
            >
              {status.message}
            </p>
          )}
        </Card>

        {loading ? (
          <Loading />
        ) : (
          <>
            <section>
              <SectionTitle>To review{review.length > 0 ? ` · ${review.length}` : ''}</SectionTitle>
              {review.length === 0 ? (
                <EmptyState title="Nothing to review." />
              ) : (
                <div className="space-y-3">
                  {review.map((t) => (
                    <Card key={t.id} className="overflow-hidden">
                      <TransactionRow t={t} lookups={lookups} showDate />
                      <div className="flex justify-end gap-2 border-t border-border px-3 py-2">
                        <Link
                          href={`/transactions/${t.id}`}
                          className="flex h-9 items-center rounded-lg px-3 text-[14px] text-accent hover:bg-surface-2"
                        >
                          Edit
                        </Link>
                        <Button
                          className="h-9 text-[14px]"
                          onClick={() => void confirmTransaction(t.id)}
                        >
                          Looks right
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
              <p className="mt-2 px-1 text-[13px] text-muted">
                Entries land here when the category was guessed or something was unclear.
              </p>
            </section>

            {unparsed.length > 0 && (
              <section>
                <SectionTitle>Couldn’t understand · {unparsed.length}</SectionTitle>
                <div className="space-y-3">
                  {unparsed.map((entry) => (
                    <Card key={entry.key} className="overflow-hidden">
                      <div className="px-4 py-3">
                        <p className="text-[15px]">“{entry.rawText}”</p>
                        <p className="text-[13px] text-muted">
                          {formatDayHeading(entry.recordedAt.slice(0, 10))}
                        </p>
                      </div>
                      <div className="flex justify-end gap-2 border-t border-border px-3 py-2">
                        <Button
                          variant="ghost"
                          className="h-9 text-[14px]"
                          onClick={() => void dismissInboxEntry(entry.key)}
                        >
                          Dismiss
                        </Button>
                        <Button
                          className="h-9 text-[14px]"
                          onClick={() =>
                            navigate('/add', {
                              state: {
                                text: entry.rawText,
                                inboxKey: entry.key,
                              } satisfies AddFromTextState,
                            })
                          }
                        >
                          Add manually
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <SiriSetupGuide />
      </div>
    </>
  )
}

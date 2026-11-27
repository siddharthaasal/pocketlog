import { useMemo, useState, type ChangeEvent } from 'react'
import { Button, Card, Field, Loading, PageHeader, Segmented, Select } from '../../components/ui'
import { readReconcileFile } from '../../data/statementFile'
import {
  useAccountBalances,
  useAccounts,
  useAllTransactions,
  useCategories,
} from '../../data/hooks'
import { saveAccountBalance } from '../../data/records'
import { balanceOn } from '../../domain/balances'
import { formatINR } from '../../domain/money'
import { linkEmails, linkTransactions, useIgnoredPayees } from '../../data/reconcile'
import { formatShortDate } from '../../lib/dates'
import { newId } from '../../lib/ids'
import { ConflictsList, ExtraList, IgnoredList, MatchedList } from './sections'
import { MissingList } from './MissingList'
import {
  buildEmailPlan,
  buildPlan,
  guessAccount,
  type Layer,
  type LoadedEmails,
  type LoadedStatement,
} from './plan'
import { ViewTabs } from '../../components/table'
import type { Account, Transaction } from '../../domain/types'

type Tab = 'missing' | 'conflicts' | 'matched' | 'extra'

export function ReconcilePage() {
  const accounts = useAccounts()
  const categories = useCategories()
  const transactions = useAllTransactions()
  const ignoredPayees = useIgnoredPayees()
  const checkpoints = useAccountBalances()
  const [files, setFiles] = useState<LoadedStatement[]>([])
  const [emails, setEmails] = useState<LoadedEmails[]>([])
  const [layerPick, setLayerPick] = useState<Layer>('bank')
  const [problems, setProblems] = useState<string[]>([])
  const [reading, setReading] = useState(false)
  const [tab, setTab] = useState<Tab>('missing')

  const ready = accounts && categories && transactions && ignoredPayees && checkpoints
  const bankPlan = useMemo(
    () => (ready ? buildPlan(files, transactions, ignoredPayees) : null),
    [ready, files, transactions, ignoredPayees],
  )
  const emailPlan = useMemo(
    () => (ready ? buildEmailPlan(emails, transactions, accounts, ignoredPayees) : null),
    [ready, emails, transactions, accounts, ignoredPayees],
  )

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const picked = [...(e.target.files ?? [])]
    e.target.value = ''
    if (picked.length === 0 || !accounts) return
    setReading(true)
    const added: LoadedStatement[] = []
    const addedEmails: LoadedEmails[] = []
    const errors: string[] = []
    for (const file of picked) {
      const result = await readReconcileFile(file)
      if (!result.ok) {
        errors.push(`${file.name}: ${result.message}`)
        continue
      }
      if (result.file.kind === 'email') {
        addedEmails.push({ id: newId(), name: file.name, ...result.file.sweep })
        continue
      }
      added.push({
        id: newId(),
        name: file.name,
        statement: result.file.statement,
        // Never guess silently: a wrong account would hide transfers and mismatch everything.
        accountId: guessAccount(result.file.statement.bank, accounts) ?? '',
      })
    }
    setFiles((current) => [...current, ...added])
    setEmails((current) => [...current, ...addedEmails])
    // Show what was just added.
    if (added.length === 0 && addedEmails.length > 0) setLayerPick('email')
    else if (added.length > 0) setLayerPick('bank')
    setProblems(errors)
    setReading(false)
  }

  if (!ready || !bankPlan || !emailPlan) return <Loading />

  // Show the layer that has something loaded, whichever was picked.
  const layer: Layer = emails.length === 0 ? 'bank' : files.length === 0 ? 'email' : layerPick
  const plan = layer === 'email' ? emailPlan : bankPlan
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? '?'
  const rowsTotal =
    layer === 'email'
      ? emails.reduce((sum, f) => sum + f.rows.length, 0)
      : files.reduce((sum, f) => sum + f.statement.rows.length, 0)
  const unlinked = plan.matched.filter((m) => !m.viaRef && m.tx.type !== 'transfer')
  const anything = files.length > 0 || emails.length > 0

  return (
    <>
      <PageHeader title="Reconcile" />
      <div className="space-y-6">
        <div className="space-y-6">
          <Card className="space-y-3 p-5">
            <p className="text-[15px]">
              Add your bank statement (.xls, .xlsx or .csv), or the text file your email sweep
              writes. PocketLog compares it with what you’ve logged, flags amounts that differ, and
              lets you add what’s missing. Files are read on this device and never uploaded.
            </p>
            <label
              className={`inline-flex h-10 w-fit cursor-pointer items-center justify-center rounded-lg bg-accent px-5 text-[14.5px] font-medium text-accent-fg hover:opacity-90 ${reading ? 'pointer-events-none opacity-40' : ''}`}
            >
              {reading ? 'Reading…' : anything ? 'Add another file' : 'Choose a file'}
              <input
                type="file"
                multiple
                accept=".xls,.xlsx,.csv,.txt,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="sr-only"
                onChange={(e) => void onFiles(e)}
              />
            </label>
            {problems.map((p) => (
              <p key={p} role="alert" className="text-[14px] text-negative">
                {p}
              </p>
            ))}
          </Card>

          {files.map((f) => (
            <Card key={f.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-medium">{f.name}</div>
                  <div className="text-[13px] text-muted">
                    {f.statement.rows.length} transactions ·{' '}
                    {formatShortDate(f.statement.from, true)} to{' '}
                    {formatShortDate(f.statement.to, true)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  className="h-9 px-3 text-[14px]"
                  onClick={() => setFiles((cur) => cur.filter((x) => x.id !== f.id))}
                >
                  Remove
                </Button>
              </div>
              <Field label="This statement is for">
                <Select
                  className="max-w-xs"
                  value={f.accountId}
                  onChange={(e) =>
                    setFiles((cur) =>
                      cur.map((x) => (x.id === f.id ? { ...x, accountId: e.target.value } : x)),
                    )
                  }
                >
                  {!f.accountId && <option value="">Choose an account…</option>}
                  {accounts
                    .filter((a) => !a.archived || a.id === f.accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </Select>
              </Field>
              {f.accountId && f.statement.closing && (
                <BalanceCheck
                  closing={f.statement.closing}
                  account={accounts.find((a) => a.id === f.accountId)}
                  transactions={transactions}
                  saved={checkpoints.some(
                    (c) =>
                      c.accountId === f.accountId &&
                      c.date === f.statement.closing?.date &&
                      c.balance === f.statement.closing?.balance,
                  )}
                />
              )}
              {!f.accountId && (
                <p className="px-1 text-[13px] text-negative">
                  Couldn’t tell which account this is. Choose one to compare it.
                </p>
              )}
            </Card>
          ))}

          {emails.map((f) => (
            <Card key={f.id} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-medium">{f.name}</div>
                <div className="text-[13px] text-muted">
                  {f.rows.length} emailed spends · {formatShortDate(f.from, true)} to{' '}
                  {formatShortDate(f.to, true)}
                  {f.skipped > 0 && ` · ${f.skipped} lines couldn’t be read`}
                </div>
              </div>
              <Button
                variant="ghost"
                className="h-9 px-3 text-[14px]"
                onClick={() => setEmails((cur) => cur.filter((x) => x.id !== f.id))}
              >
                Remove
              </Button>
            </Card>
          ))}
        </div>

        {anything && (
          <section className="space-y-4">
            {files.length > 0 && emails.length > 0 && (
              <Segmented<Layer>
                value={layer}
                onChange={setLayerPick}
                options={[
                  { value: 'bank', label: 'Bank statements' },
                  { value: 'email', label: 'Emails' },
                ]}
              />
            )}
            <p className="px-1 text-[14px] text-muted">
              {layer === 'email'
                ? `${rowsTotal} emailed spends: ${plan.matched.length} already in PocketLog, ${plan.conflicts.length} with a different amount, ${plan.missing.length} missing${plan.ignored.length > 0 ? `, ${plan.ignored.length} ignored` : ''}.`
                : `${rowsTotal} statement rows: ${plan.matched.length} already in PocketLog, ${plan.conflicts.length} with a different amount, ${plan.missing.length} missing${plan.ignored.length > 0 ? `, ${plan.ignored.length} ignored as bank noise` : ''}.`}
            </p>
            <ViewTabs<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { value: 'missing', label: 'Missing', count: plan.missing.length },
                { value: 'conflicts', label: 'Differ', count: plan.conflicts.length },
                { value: 'matched', label: 'Matched', count: plan.matched.length },
                { value: 'extra', label: 'Extra', count: plan.extra.length },
              ]}
            />

            {tab === 'missing' && (
              <MissingList
                key={layer}
                items={plan.missing}
                transactions={transactions}
                categories={categories}
                accounts={accounts}
                layer={layer}
              />
            )}
            {tab === 'conflicts' && (
              <ConflictsList
                conflicts={plan.conflicts}
                categories={categories}
                accounts={accounts}
                layer={layer}
              />
            )}
            {tab === 'matched' && (
              <MatchedList
                matched={plan.matched}
                categories={categories}
                accountName={accountName}
                unlinked={unlinked.length}
                onRemember={() =>
                  void (layer === 'email'
                    ? linkEmails(unlinked.map((m) => ({ id: m.tx.id, emailRef: m.row.key })))
                    : linkTransactions(unlinked.map((m) => ({ id: m.tx.id, bankRef: m.row.key }))))
                }
              />
            )}
            {tab === 'extra' && (
              <ExtraList
                extra={plan.extra}
                categories={categories}
                accounts={accounts}
                layer={layer}
              />
            )}

            {plan.ignored.length > 0 && <IgnoredList ignored={plan.ignored} />}
          </section>
        )}
      </div>
    </>
  )
}

/** Compares the balance the statement ends with against what PocketLog works out for that day. */
function BalanceCheck({
  closing,
  account,
  transactions,
  saved,
}: {
  closing: { date: string; balance: number }
  account: Account | undefined
  transactions: readonly Transaction[]
  saved: boolean
}) {
  if (!account) return null
  const computed = balanceOn(account, transactions, closing.date)
  const gap = computed - closing.balance
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-surface-2 px-3 py-2 text-[13.5px]">
      <span className="min-w-0 flex-1">
        Statement ends at {formatINR(closing.balance)} on {formatShortDate(closing.date, true)}.{' '}
        {gap === 0 ? (
          'PocketLog agrees.'
        ) : (
          <span className="text-negative">
            PocketLog works out {formatINR(computed)}, {formatINR(Math.abs(gap))}{' '}
            {gap > 0 ? 'more' : 'less'}. Add the missing entries below, or check the opening
            balance.
          </span>
        )}
      </span>
      {saved ? (
        <span className="text-muted">Saved as a balance check</span>
      ) : (
        <Button
          variant="secondary"
          className="h-8 px-3 text-[13px]"
          onClick={() =>
            void saveAccountBalance(account.id, closing.date, closing.balance, 'reconcile')
          }
        >
          Save balance check
        </Button>
      )}
    </div>
  )
}

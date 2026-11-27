import { useMemo, useState, type ChangeEvent } from 'react'
import { Button, Card, Field, Loading, PageHeader, Select } from '../../components/ui'
import { readStatementFile } from '../../data/statementFile'
import { useAccounts, useAllTransactions, useCategories } from '../../data/hooks'
import { linkTransactions, useIgnoredPayees } from '../../data/reconcile'
import { formatShortDate } from '../../lib/dates'
import { newId } from '../../lib/ids'
import { ConflictsList, ExtraList, IgnoredList, MatchedList } from './sections'
import { MissingList } from './MissingList'
import { buildPlan, guessAccount, type LoadedStatement } from './plan'
import { ViewTabs } from '../../components/table'

type Tab = 'missing' | 'conflicts' | 'matched' | 'extra'

export function ReconcilePage() {
  const accounts = useAccounts()
  const categories = useCategories()
  const transactions = useAllTransactions()
  const ignoredPayees = useIgnoredPayees()
  const [files, setFiles] = useState<LoadedStatement[]>([])
  const [problems, setProblems] = useState<string[]>([])
  const [reading, setReading] = useState(false)
  const [tab, setTab] = useState<Tab>('missing')

  const ready = accounts && categories && transactions && ignoredPayees
  const plan = useMemo(
    () => (ready ? buildPlan(files, transactions, ignoredPayees) : null),
    [ready, files, transactions, ignoredPayees],
  )

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const picked = [...(e.target.files ?? [])]
    e.target.value = ''
    if (picked.length === 0 || !accounts) return
    setReading(true)
    const added: LoadedStatement[] = []
    const errors: string[] = []
    for (const file of picked) {
      const result = await readStatementFile(file)
      if (!result.ok) {
        errors.push(`${file.name}: ${result.message}`)
        continue
      }
      added.push({
        id: newId(),
        name: file.name,
        statement: result.statement,
        // Never guess silently: a wrong account would hide transfers and mismatch everything.
        accountId: guessAccount(result.statement.bank, accounts) ?? '',
      })
    }
    setFiles((current) => [...current, ...added])
    setProblems(errors)
    setReading(false)
  }

  if (!ready || !plan) return <Loading />

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? '?'
  const rowsTotal = files.reduce((sum, f) => sum + f.statement.rows.length, 0)
  const unlinked = plan.matched.filter((m) => !m.viaRef && m.tx.type !== 'transfer')

  return (
    <>
      <PageHeader title="Reconcile" />
      <div className="space-y-6">
        <div className="space-y-6">
          <Card className="space-y-3 p-5">
            <p className="text-[15px]">
              Add your bank statement (.xls, .xlsx or .csv). PocketLog compares it with what you’ve
              logged, flags amounts that differ, and lets you add what’s missing. The file is read
              on this device and never uploaded.
            </p>
            <label
              className={`inline-flex h-10 w-fit cursor-pointer items-center justify-center rounded-lg bg-accent px-5 text-[14.5px] font-medium text-accent-fg hover:opacity-90 ${reading ? 'pointer-events-none opacity-40' : ''}`}
            >
              {reading
                ? 'Reading…'
                : files.length > 0
                  ? 'Add another statement'
                  : 'Choose statement'}
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
              {!f.accountId && (
                <p className="px-1 text-[13px] text-negative">
                  Couldn’t tell which account this is. Choose one to compare it.
                </p>
              )}
            </Card>
          ))}
        </div>

        {files.length > 0 && (
          <section className="space-y-4">
            <p className="px-1 text-[14px] text-muted">
              {rowsTotal} statement rows: {plan.matched.length} already in PocketLog,{' '}
              {plan.conflicts.length} with a different amount, {plan.missing.length} missing
              {plan.ignored.length > 0 ? `, ${plan.ignored.length} ignored as bank noise` : ''}.
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
                items={plan.missing}
                transactions={transactions}
                categories={categories}
                accounts={accounts}
              />
            )}
            {tab === 'conflicts' && (
              <ConflictsList
                conflicts={plan.conflicts}
                categories={categories}
                accounts={accounts}
              />
            )}
            {tab === 'matched' && (
              <MatchedList
                matched={plan.matched}
                categories={categories}
                accountName={accountName}
                unlinked={unlinked.length}
                onRemember={() =>
                  void linkTransactions(unlinked.map((m) => ({ id: m.tx.id, bankRef: m.row.key })))
                }
              />
            )}
            {tab === 'extra' && (
              <ExtraList extra={plan.extra} categories={categories} accounts={accounts} />
            )}

            {plan.ignored.length > 0 && <IgnoredList ignored={plan.ignored} />}
          </section>
        )}
      </div>
    </>
  )
}

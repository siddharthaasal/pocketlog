import { useMemo, useState } from 'react'
import { Button, Card, EmptyState, Money, TextInput, Select } from '../../components/ui'
import { addIgnoredPayee, addStatementEntries } from '../../data/reconcile'
import { extractPayee, payeeKey } from '../../domain/reconcile'
import type { Account, Category, Transaction } from '../../domain/types'
import { formatDayHeading } from '../../lib/dates'
import { defaultDraft, sameDirectionKey, toEntry, type Draft, type MissingItem } from './plan'

interface Props {
  items: MissingItem[]
  transactions: Transaction[]
  categories: Category[]
  accounts: Account[]
}

type Override = Partial<Draft> & { touched?: boolean }

export function MissingList({ items, transactions, categories, accounts }: Props) {
  const [overrides, setOverrides] = useState<Record<string, Override>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const defaults = useMemo(
    () => new Map(items.map((i) => [i.id, defaultDraft(i, transactions, categories)])),
    [items, transactions, categories],
  )
  const draftOf = (item: MissingItem): Draft => ({
    ...defaults.get(item.id)!,
    ...overrides[item.id],
  })
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? '?'

  function setChoice(item: MissingItem, choice: string) {
    // Same payee, same direction: apply the choice to every row you haven't edited yourself.
    const group = sameDirectionKey(item.row)
    const spread = !item.pair && !choice.startsWith('acct:')
    setOverrides((cur) => {
      const next = { ...cur }
      next[item.id] = { ...cur[item.id], choice, needsReview: false, touched: true }
      if (spread) {
        for (const other of items) {
          if (other.id === item.id || other.pair || cur[other.id]?.touched) continue
          if (sameDirectionKey(other.row) === group) {
            next[other.id] = { ...cur[other.id], choice, needsReview: false }
          }
        }
      }
      return next
    })
  }

  async function add(ids: string[]) {
    const entries = []
    for (const id of ids) {
      const item = items.find((i) => i.id === id)!
      const entry = toEntry(item, draftOf(item))
      if (!entry) {
        setMessage(`Choose a category for “${extractPayee(item.row.narration)}” first.`)
        return
      }
      entries.push(entry)
    }
    setBusy(true)
    try {
      await addStatementEntries(entries)
      setSelected(new Set())
      setMessage(`Added ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}.`)
    } catch (error) {
      setMessage(`Nothing was added: ${(error as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  if (items.length === 0) {
    return <EmptyState title="Nothing missing. Every statement row is already in PocketLog. 🎉" />
  }

  const allSelected = selected.size === items.length
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          className="h-9 text-[14px]"
          onClick={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)))}
        >
          {allSelected ? 'Clear' : 'Select all'}
        </Button>
        <Button
          className="h-9 text-[14px]"
          disabled={busy || selected.size === 0}
          onClick={() => void add([...selected])}
        >
          Add {selected.size || ''} selected
        </Button>
        <span className="text-[13px] text-muted">
          Items marked “check” are guesses; they’ll land in your review list.
        </span>
      </div>
      {message && (
        <p role="status" className="px-1 text-[14px] text-muted">
          {message}
        </p>
      )}

      {items.map((item) => {
        const draft = draftOf(item)
        const { row } = item
        const type = row.direction === 'out' ? 'expense' : 'income'
        const choices = categories.filter((c) => c.type === type && !c.archived)
        const others = accounts.filter((a) => !a.archived && a.id !== item.accountId)
        const payee = extractPayee(row.narration)
        return (
          <Card key={item.id} className="space-y-2 px-4 py-3">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1.5 h-4 w-4 accent-accent"
                aria-label={`Select ${payee}`}
                checked={selected.has(item.id)}
                onChange={(e) =>
                  setSelected((cur) => {
                    const next = new Set(cur)
                    if (e.target.checked) next.add(item.id)
                    else next.delete(item.id)
                    return next
                  })
                }
              />
              <div className="min-w-0 flex-1" title={row.narration}>
                <div className="truncate text-[15px]">{payee}</div>
                <div className="truncate text-[13px] text-muted">
                  {formatDayHeading(row.date)} · {accountName(item.accountId)}
                  {item.pair && ` ↔ ${accountName(item.pair.accountId)} (one transfer)`}
                  {draft.needsReview && !item.pair && (
                    <span className="ml-1.5 font-medium text-accent">check</span>
                  )}
                </div>
              </div>
              <Money
                className="shrink-0 whitespace-nowrap"
                paise={row.direction === 'out' ? -row.amount : row.amount}
                signed={row.direction === 'in'}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <TextInput
                aria-label="Description"
                className="h-9 min-w-40 flex-1 py-1 text-[14px]"
                value={draft.description}
                onChange={(e) =>
                  setOverrides((cur) => ({
                    ...cur,
                    [item.id]: { ...cur[item.id], description: e.target.value },
                  }))
                }
              />
              <Select
                aria-label="Category"
                className="h-9 min-w-40 flex-1 py-1 text-[14px]"
                value={draft.choice}
                onChange={(e) => setChoice(item, e.target.value)}
              >
                {!draft.choice && <option value="">Choose…</option>}
                {!item.pair && (
                  <optgroup label={type === 'expense' ? 'Expense categories' : 'Income categories'}>
                    {choices.map((c) => (
                      <option key={c.id} value={`cat:${c.id}`}>
                        {c.icon} {c.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Move between your accounts">
                  {others
                    .filter((a) => !item.pair || a.id === item.pair.accountId)
                    .map((a) => (
                      <option key={a.id} value={`acct:${a.id}`}>
                        {row.direction === 'out' ? '→ Transfer to' : '← Transfer from'} {a.name}
                      </option>
                    ))}
                </optgroup>
              </Select>
            </div>
            <div className="flex justify-end gap-1">
              {!item.pair && (
                <Button
                  variant="ghost"
                  className="h-9 px-3 text-[14px]"
                  onClick={() => void addIgnoredPayee(payeeKey(payee))}
                >
                  Always ignore “{payee.length > 18 ? `${payee.slice(0, 18)}…` : payee}”
                </Button>
              )}
              <Button
                className="h-9 px-4 text-[14px]"
                disabled={busy}
                onClick={() => void add([item.id])}
              >
                Add
              </Button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

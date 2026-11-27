import { useMemo, useState } from 'react'
import { EmptyState, Money } from '../../components/ui'
import { addIgnoredPayee, addStatementEntries } from '../../data/reconcile'
import { extractPayee, payeeKey } from '../../domain/reconcile'
import type { Account, Category, Transaction } from '../../domain/types'
import { formatShortDate } from '../../lib/dates'
import { defaultDraft, sameDirectionKey, toEntry, type Draft, type MissingItem } from './plan'
import { SmallButton, Table, Tag, TagSelect, Td, Th, Tr } from './table'

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
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <SmallButton
          onClick={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)))}
        >
          {allSelected ? 'Clear selection' : 'Select all'}
        </SmallButton>
        <SmallButton
          tone="primary"
          disabled={busy || selected.size === 0}
          onClick={() => void add([...selected])}
        >
          Add {selected.size > 0 ? selected.size : ''} selected
        </SmallButton>
        {message && (
          <span role="status" className="text-[13px] text-muted">
            {message}
          </span>
        )}
        <span className="ml-auto text-[12px] text-muted">
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" /> guessed category;
          it will be added for review
        </span>
      </div>

      <Table minWidth={820}>
        <thead>
          <tr>
            <Th className="w-9" />
            <Th className="w-20">Date</Th>
            <Th>Name</Th>
            <Th className="w-28 text-right">Amount</Th>
            <Th className="w-52">Category</Th>
            <Th className="w-24">Account</Th>
            <Th className="w-36" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const draft = draftOf(item)
            const { row } = item
            const type = row.direction === 'out' ? 'expense' : 'income'
            const payee = extractPayee(row.narration)
            const picked = draft.choice.startsWith('cat:')
              ? categories.find((c) => c.id === draft.choice.slice(4))
              : undefined
            const others = accounts.filter((a) => !a.archived && a.id !== item.accountId)
            return (
              <Tr key={item.id} selected={selected.has(item.id)}>
                <Td>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-accent"
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
                </Td>
                <Td className="whitespace-nowrap text-muted">{formatShortDate(row.date)}</Td>
                <Td className="max-w-0">
                  <input
                    aria-label="Description"
                    className="-mx-1 block w-full rounded px-1 py-0.5 outline-none focus:bg-bg focus:ring-2 focus:ring-accent"
                    value={draft.description}
                    onChange={(e) =>
                      setOverrides((cur) => ({
                        ...cur,
                        [item.id]: { ...cur[item.id], description: e.target.value },
                      }))
                    }
                  />
                  <div className="truncate text-[12px] text-muted" title={row.narration}>
                    {item.pair ? `Transfer with ${accountName(item.pair.accountId)}` : payee}
                  </div>
                </Td>
                <Td className="text-right whitespace-nowrap">
                  <Money
                    paise={row.direction === 'out' ? -row.amount : row.amount}
                    signed={row.direction === 'in'}
                  />
                </Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    {draft.needsReview && !item.pair && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
                        title="Guessed — will be added for review"
                      />
                    )}
                    <TagSelect
                      aria-label="Category"
                      color={picked?.color}
                      value={draft.choice}
                      onChange={(e) => setChoice(item, e.target.value)}
                    >
                      {!draft.choice && <option value="">Choose…</option>}
                      {!item.pair && (
                        <optgroup
                          label={type === 'expense' ? 'Expense categories' : 'Income categories'}
                        >
                          {categories
                            .filter((c) => c.type === type && !c.archived)
                            .map((c) => (
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
                              {row.direction === 'out' ? '→ Transfer to' : '← Transfer from'}{' '}
                              {a.name}
                            </option>
                          ))}
                      </optgroup>
                    </TagSelect>
                  </div>
                </Td>
                <Td>
                  <Tag>{accountName(item.accountId)}</Tag>
                </Td>
                <Td className="text-right whitespace-nowrap">
                  {!item.pair && (
                    <SmallButton
                      title={`Always ignore “${payee}”`}
                      onClick={() => void addIgnoredPayee(payeeKey(payee))}
                    >
                      Ignore
                    </SmallButton>
                  )}
                  <SmallButton tone="primary" disabled={busy} onClick={() => void add([item.id])}>
                    Add
                  </SmallButton>
                </Td>
              </Tr>
            )
          })}
        </tbody>
      </Table>
    </div>
  )
}

import { useState } from 'react'
import { FitSelect } from '../../components/ui'
import type { Lookups } from '../../data/hooks'
import { bulkUpdateTransactions, deleteTransactions, type BulkChange } from '../../data/repo'
import type { Transaction } from '../../domain/types'
import { cx } from '../../lib/cx'

/**
 * Changes for the ticked rows of the transactions table: category, account, tags, delete.
 * Each control applies as soon as it is used, then says how many rows it changed.
 */
export function BulkBar({
  selected,
  lookups,
  onDone,
}: {
  selected: readonly Transaction[]
  lookups: Lookups
  onDone: () => void
}) {
  const [tag, setTag] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const ids = selected.map((t) => t.id)
  const tags = [...new Set(selected.flatMap((t) => t.tags ?? []))].sort()
  const categories = [...lookups.categories.values()].filter((c) => !c.archived)
  const accounts = [...lookups.accounts.values()].filter((a) => !a.archived)

  async function apply(change: BulkChange, what: string) {
    setBusy(true)
    try {
      const { updated, skipped } = await bulkUpdateTransactions(ids, change)
      setMessage(
        `${what} on ${updated} ${updated === 1 ? 'entry' : 'entries'}` +
          (skipped > 0 ? `; ${skipped} left as ${skipped === 1 ? 'it was' : 'they were'}` : '') +
          '.',
      )
    } catch (error) {
      setMessage((error as Error).message)
    }
    setBusy(false)
  }

  async function remove() {
    const n = ids.length
    if (!window.confirm(`Delete ${n} ${n === 1 ? 'transaction' : 'transactions'}?`)) return
    await deleteTransactions(ids)
    setMessage('')
    onDone()
  }

  const control = 'h-8 shrink-0 rounded-md border border-border bg-surface px-2.5 text-[13.5px]'
  return (
    <div className="sticky top-2 z-10 mb-2 space-y-1 rounded-xl border border-border bg-bg/95 px-3 py-2 shadow-sm backdrop-blur">
      <div
        className={cx(
          'flex flex-wrap items-center gap-2',
          busy && 'pointer-events-none opacity-60',
        )}
      >
        <span className="mr-1 text-[14px] font-medium tabular-nums">{ids.length} selected</span>
        <FitSelect
          aria-label="Set category"
          className={control}
          value=""
          onChange={(e) => {
            const c = lookups.categories.get(e.target.value)
            if (c) void apply({ kind: 'category', categoryId: c.id }, `Category set to ${c.name}`)
          }}
        >
          <option value="">Set category</option>
          {(['expense', 'income'] as const).map((type) => (
            <optgroup key={type} label={type === 'expense' ? 'Expense' : 'Income'}>
              {categories
                .filter((c) => c.type === type)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </FitSelect>
        <FitSelect
          aria-label="Move to account"
          className={control}
          value=""
          onChange={(e) => {
            const a = lookups.accounts.get(e.target.value)
            if (a) void apply({ kind: 'account', accountId: a.id }, `Moved to ${a.name}`)
          }}
        >
          <option value="">Move to account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </FitSelect>
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            const t = tag.trim().toLowerCase()
            if (!t) return
            void apply({ kind: 'addTag', tag: t }, `Tagged #${t}`)
            setTag('')
          }}
        >
          <input
            aria-label="Tag to add"
            placeholder="Add a tag"
            value={tag}
            maxLength={30}
            onChange={(e) => setTag(e.target.value)}
            className={cx(control, 'w-32 outline-none focus:border-accent md:text-[13.5px]!')}
          />
        </form>
        {tags.length > 0 && (
          <FitSelect
            aria-label="Remove tag"
            className={control}
            value=""
            onChange={(e) => {
              const t = e.target.value
              if (t) void apply({ kind: 'removeTag', tag: t }, `Removed #${t}`)
            }}
          >
            <option value="">Remove tag</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </FitSelect>
        )}
        <button
          type="button"
          className="h-8 rounded-md px-2.5 text-[13.5px] text-negative hover:bg-surface-2"
          onClick={() => void remove()}
        >
          Delete
        </button>
        <button
          type="button"
          className="ml-auto h-8 rounded-md px-2.5 text-[13.5px] text-muted hover:bg-surface-2"
          onClick={() => {
            setMessage('')
            onDone()
          }}
        >
          Clear selection
        </button>
      </div>
      {message && <p className="px-1 text-[13px] text-muted">{message}</p>}
    </div>
  )
}

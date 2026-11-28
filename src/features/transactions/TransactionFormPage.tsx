import { useState, type FormEvent } from 'react'
import { useLocation, useParams, useSearchParams } from 'wouter'
import {
  Button,
  Card,
  Field,
  Loading,
  PageHeader,
  Segmented,
  Select,
  TextArea,
  TextInput,
} from '../../components/ui'
import { cx } from '../../lib/cx'
import {
  useAccounts,
  useAllTransactions,
  useCategories,
  useHoldings,
  useLoans,
  useSubscriptions,
  useTransaction,
} from '../../data/hooks'
import {
  addTransaction,
  deleteTransaction,
  pickDefaultAccount,
  updateTransaction,
} from '../../data/repo'
import { toFieldErrors } from '../../domain/errors'
import { formatINR, paiseToInput, parseRupees } from '../../domain/money'
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type Account,
  type Category,
  type PaymentMethod,
  type Transaction,
  type TransactionInput,
  type TransactionType,
} from '../../domain/types'
import { formatShortDate, todayISO } from '../../lib/dates'
import { goBack } from '../../lib/navigation'
import { parseWordList } from '../../lib/words'
import { resolveInboxEntry } from '../../data/inbox'
import { CategoryIcon } from '../../components/categoryIcons'
import { MicIcon } from '../../components/icons'
import { ISSUE_MESSAGES, parseEntry, type ParseIssue, type ParseResult } from '../../parser/parse'
import type { AddFromTextState } from '../inbox/InboxPage'

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
] as const

const DESCRIPTION_PLACEHOLDERS: Record<TransactionType, string> = {
  expense: 'Lunch with team',
  income: 'November salary',
  transfer: 'ATM withdrawal',
}

/** A sensible destination for a transfer: Cash if it isn't the source, else any other active account. */
function pickTransferTarget(accounts: readonly Account[], fromId: string): string {
  const others = accounts.filter((a) => !a.archived && a.id !== fromId)
  return (others.find((a) => a.type === 'cash') ?? others[0])?.id ?? ''
}

function parseType(value: string | null): TransactionType {
  return value === 'income' || value === 'transfer' ? value : 'expense'
}

interface FormState {
  type: TransactionType
  amount: string
  description: string
  categoryId: string
  accountId: string
  /** Transfers only. */
  toAccountId: string
  date: string
  merchant: string
  paymentMethod: PaymentMethod | ''
  notes: string
  /** Optional links to the finance tracker; empty string means none. */
  refundOf: string
  loanId: string
  subscriptionId: string
  holdingId: string
  /** Comma-separated. */
  tags: string
  /** Expenses only; empty when the whole amount is one category. */
  splits: SplitDraft[]
}

interface SplitDraft {
  key: number
  categoryId: string
  amount: string
}

let splitKey = 0
const newPart = (categoryId = '', amount = ''): SplitDraft => ({
  key: ++splitKey,
  categoryId,
  amount,
})

/** Handles both /add and /transactions/:id. */
export function TransactionFormPage() {
  const { id } = useParams<{ id?: string }>()
  const [params] = useSearchParams()
  const existing = useTransaction(id)
  const categories = useCategories()
  const accounts = useAccounts()

  const prefill = id ? undefined : readAddState()
  const title = id ? 'Edit transaction' : 'New transaction'
  if (!categories || !accounts || (id && existing === undefined)) {
    return (
      <>
        <PageHeader title={title} />
        <Loading />
      </>
    )
  }
  if (id && !existing) {
    return (
      <>
        <PageHeader title={title} back="/transactions" />
        <p className="text-muted">This transaction was deleted.</p>
      </>
    )
  }

  const initial: FormState = existing
    ? {
        type: existing.type,
        amount: paiseToInput(existing.amount),
        description: existing.description,
        categoryId: existing.categoryId ?? '',
        accountId: existing.accountId,
        toAccountId: existing.toAccountId ?? '',
        date: existing.date,
        merchant: existing.merchant ?? '',
        paymentMethod: existing.paymentMethod ?? '',
        notes: existing.notes ?? '',
        refundOf: existing.refundOf ?? '',
        loanId: existing.loanId ?? '',
        subscriptionId: existing.subscriptionId ?? '',
        holdingId: existing.holdingId ?? '',
        tags: (existing.tags ?? []).join(', '),
        splits: (existing.splits ?? []).map((p) => newPart(p.categoryId, paiseToInput(p.amount))),
      }
    : prefill
      ? applyParse(
          newFormState('expense', accounts),
          parseEntry(prefill.text, { categories, accounts, today: todayISO() }),
          accounts,
        )
      : newFormState(parseType(params.get('type')), accounts)

  return (
    <>
      <PageHeader title={title} />
      <TransactionForm
        key={existing?.id ?? 'new'}
        existing={existing ?? undefined}
        initial={initial}
        prefill={prefill}
        categories={categories}
        accounts={accounts}
      />
    </>
  )
}

/** Text handed over from the Siri inbox ("Add manually"), carried in history state. */
function readAddState(): AddFromTextState | undefined {
  const state: unknown = window.history.state
  if (state && typeof state === 'object' && typeof (state as AddFromTextState).text === 'string') {
    return state as AddFromTextState
  }
  return undefined
}

/** Copies a parse result into the form. A guessed category is left blank so it gets picked. */
function applyParse(form: FormState, r: ParseResult, accounts: readonly Account[]): FormState {
  const accountId = r.accountId ?? form.accountId
  return {
    ...form,
    type: r.type,
    amount: r.amount ? paiseToInput(r.amount) : form.amount,
    description: r.description || form.description,
    categoryId: r.issues.includes('category-guessed') ? '' : (r.categoryId ?? ''),
    accountId,
    toAccountId:
      r.type === 'transfer' ? (r.toAccountId ?? pickTransferTarget(accounts, accountId)) : '',
    date: r.date,
    paymentMethod: r.paymentMethod ?? form.paymentMethod,
  }
}

function newFormState(type: TransactionType, accounts: readonly Account[]): FormState {
  const accountId = pickDefaultAccount(accounts)?.id ?? ''
  return {
    type,
    amount: '',
    description: '',
    categoryId: '',
    accountId,
    toAccountId: type === 'transfer' ? pickTransferTarget(accounts, accountId) : '',
    date: todayISO(),
    merchant: '',
    paymentMethod: '',
    notes: '',
    refundOf: '',
    loanId: '',
    subscriptionId: '',
    holdingId: '',
    tags: '',
    splits: [],
  }
}

function TransactionForm({
  existing,
  initial,
  prefill,
  categories,
  accounts,
}: {
  existing: Transaction | undefined
  initial: FormState
  prefill: AddFromTextState | undefined
  categories: Category[]
  accounts: Account[]
}) {
  const [, navigate] = useLocation()
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [quickText, setQuickText] = useState(prefill?.text ?? '')
  const [quickIssues, setQuickIssues] = useState<ParseIssue[]>(() =>
    prefill ? parseEntry(prefill.text, { categories, accounts, today: todayISO() }).issues : [],
  )

  function fillFromText() {
    if (!quickText.trim()) return
    const result = parseEntry(quickText, { categories, accounts, today: todayISO() })
    setForm((f) => applyParse(f, result, accounts))
    setQuickIssues(result.issues)
    setErrors({})
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  // Archived items stay selectable only if this transaction already uses them.
  const visibleCategories = categories.filter(
    (c) => c.type === form.type && (!c.archived || c.id === initial.categoryId),
  )
  const visibleAccounts = accounts.filter(
    (a) => !a.archived || a.id === initial.accountId || a.id === initial.toAccountId,
  )
  const isTransfer = form.type === 'transfer'

  function changeType(type: TransactionType) {
    setForm((f) => ({
      ...f,
      type,
      refundOf: type === 'income' ? f.refundOf : '',
      loanId: type === 'income' ? '' : f.loanId,
      subscriptionId: type === 'expense' ? f.subscriptionId : '',
      holdingId: type === 'transfer' ? f.holdingId : '',
      splits: type === 'expense' ? f.splits : [],
      categoryId:
        type !== 'income' || !f.refundOf
          ? categories.find((c) => c.id === f.categoryId)?.type === type
            ? f.categoryId
            : ''
          : f.categoryId,
      toAccountId:
        type === 'transfer' && (!f.toAccountId || f.toAccountId === f.accountId)
          ? pickTransferTarget(accounts, f.accountId)
          : f.toAccountId,
    }))
    setErrors({})
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const amount = parseRupees(form.amount)
    if (amount === null || amount === 0) {
      setErrors({ amount: 'Enter an amount, e.g. 350 or 99.50' })
      return
    }
    const split = form.type === 'expense' && form.splits.length > 0
    const splits = split ? readSplits(form.splits, amount) : undefined
    if (typeof splits === 'string') {
      setErrors({ splits })
      return
    }
    const tags = parseWordList(form.tags)
    const input: TransactionInput = {
      type: form.type,
      amount,
      description: form.description.trim(),
      categoryId: isTransfer
        ? undefined
        : (splits?.[0]?.categoryId ?? (form.categoryId || undefined)),
      splits,
      tags: tags.length > 0 ? tags : undefined,
      accountId: form.accountId,
      toAccountId: isTransfer ? form.toAccountId || undefined : undefined,
      date: form.date,
      merchant: form.merchant.trim() || undefined,
      paymentMethod: isTransfer ? undefined : form.paymentMethod || undefined,
      notes: form.notes.trim() || undefined,
      refundOf: form.type === 'income' ? form.refundOf || undefined : undefined,
      loanId: form.loanId || undefined,
      subscriptionId: form.subscriptionId || undefined,
      holdingId: form.holdingId || undefined,
    }
    setSaving(true)
    try {
      if (existing) await updateTransaction(existing.id, input)
      else {
        const saved = await addTransaction(input)
        if (prefill?.inboxKey) await resolveInboxEntry(prefill.inboxKey, saved.id)
      }
      goBack(navigate)
    } catch (error) {
      setErrors(toFieldErrors(error) ?? { form: (error as Error).message })
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!existing || !window.confirm('Delete this transaction?')) return
    await deleteTransaction(existing.id)
    goBack(navigate, '/transactions')
  }

  const hasDetails = Boolean(
    initial.merchant ||
    initial.paymentMethod ||
    initial.notes ||
    initial.loanId ||
    initial.subscriptionId ||
    initial.holdingId ||
    initial.tags,
  )

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {!existing && (
        <div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <MicIcon
                width={18}
                height={18}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
              />
              <TextInput
                value={quickText}
                onChange={(e) => setQuickText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    fillFromText()
                  }
                }}
                placeholder="Spent 350 on lunch using HDFC"
                aria-label="Describe the transaction"
                enterKeyHint="done"
                className="pl-9"
              />
            </div>
            <Button variant="secondary" onClick={fillFromText} disabled={!quickText.trim()}>
              Fill
            </Button>
          </div>
          <p className="mt-1.5 px-1 text-[13px] text-muted">
            {quickIssues.length > 0
              ? `Check: ${quickIssues.map((i) => ISSUE_MESSAGES[i]).join(' · ')}`
              : 'Type or dictate a sentence to fill the form.'}
          </p>
        </div>
      )}

      <Segmented value={form.type} options={TYPE_OPTIONS} onChange={changeType} />

      <Field label="Amount" error={errors.amount}>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[28px] text-muted">
            ₹
          </span>
          <input
            inputMode="decimal"
            autoComplete="off"
            autoFocus={!existing}
            placeholder="0"
            value={form.amount}
            onChange={(e) => set('amount', e.target.value)}
            className="block h-16 w-full rounded-xl border border-border bg-surface pr-4 pl-11 text-[32px] font-semibold tabular-nums outline-none placeholder:text-muted/60 focus:border-accent"
          />
        </div>
      </Field>

      {form.type === 'income' && (
        <RefundPicker
          value={form.refundOf}
          selfId={existing?.id}
          categories={categories}
          error={errors.refundOf}
          onChange={(original) =>
            setForm((f) => ({
              ...f,
              refundOf: original?.id ?? '',
              // The refund counts against the expense's category.
              categoryId: original
                ? (original.categoryId ?? '')
                : categories.find((c) => c.id === f.categoryId)?.type === 'income'
                  ? f.categoryId
                  : '',
            }))
          }
        />
      )}

      {form.type === 'expense' && form.splits.length > 0 && (
        <SplitEditor
          parts={form.splits}
          amount={parseRupees(form.amount) ?? 0}
          categories={visibleCategories}
          error={errors.splits ?? errors.categoryId}
          onChange={(splits) => set('splits', splits)}
          onCancel={() =>
            setForm((f) => ({ ...f, categoryId: f.splits[0]?.categoryId ?? '', splits: [] }))
          }
        />
      )}

      {!isTransfer && !form.refundOf && form.splits.length === 0 && (
        <Field label="Category" error={errors.categoryId} group>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {visibleCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => set('categoryId', c.id)}
                aria-pressed={form.categoryId === c.id}
                className={cx(
                  'flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-1 py-2 text-center text-[12px] leading-tight',
                  form.categoryId === c.id
                    ? 'border-accent bg-accent/10 text-text'
                    : 'border-border bg-surface text-muted hover:bg-surface-2',
                )}
              >
                <CategoryIcon icon={c.icon} size={22} />
                {c.name}
              </button>
            ))}
          </div>
          {form.type === 'expense' && (
            <button
              type="button"
              className="mt-2 px-1 text-[14px] text-accent"
              onClick={() => set('splits', [newPart(form.categoryId, form.amount), newPart()])}
            >
              Split across categories
            </button>
          )}
        </Field>
      )}

      <Field label="Description" error={errors.description}>
        <TextInput
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder={DESCRIPTION_PLACEHOLDERS[form.type]}
          autoCapitalize="sentences"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={isTransfer ? 'From' : 'Account'} error={errors.accountId}>
          <Select value={form.accountId} onChange={(e) => set('accountId', e.target.value)}>
            {visibleAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        {isTransfer && (
          <Field label="To" error={errors.toAccountId}>
            <Select value={form.toAccountId} onChange={(e) => set('toAccountId', e.target.value)}>
              {visibleAccounts.map((a) => (
                <option key={a.id} value={a.id} disabled={a.id === form.accountId}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className={isTransfer ? 'col-span-2' : undefined}>
          <Field label="Date" error={errors.date}>
            <TextInput
              type="date"
              value={form.date}
              max="9999-12-31"
              onChange={(e) => set('date', e.target.value)}
            />
          </Field>
        </div>
      </div>

      <details open={hasDetails} className="group">
        <summary className="cursor-pointer list-none px-1 text-[15px] text-accent">
          <span className="group-open:hidden">More details</span>
          <span className="hidden group-open:inline">Fewer details</span>
        </summary>
        <Card className="mt-3 space-y-4 bg-transparent p-4">
          {!isTransfer && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Merchant" error={errors.merchant}>
                <TextInput
                  value={form.merchant}
                  onChange={(e) => set('merchant', e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Paid via">
                <Select
                  value={form.paymentMethod}
                  onChange={(e) => set('paymentMethod', e.target.value as PaymentMethod | '')}
                >
                  <option value="">-</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
          <Field
            label="Tags"
            error={errors.tags}
            hint="Comma-separated labels for spending across categories, e.g. goa trip, shared."
          >
            <TextInput
              value={form.tags}
              onChange={(e) => set('tags', e.target.value)}
              placeholder="Optional"
              autoCapitalize="none"
            />
          </Field>
          <TrackerLinks form={form} set={set} errors={errors} />
          <Field label="Notes" error={errors.notes}>
            <TextArea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Optional"
            />
          </Field>
        </Card>
      </details>

      {errors.form && <p className="text-[14px] text-negative">{errors.form}</p>}

      <div className="flex flex-col gap-2 pt-2">
        <Button type="submit" disabled={saving} className="h-12">
          {existing ? 'Save changes' : 'Add transaction'}
        </Button>
        {existing && (
          <Button variant="danger" onClick={onDelete}>
            Delete transaction
          </Button>
        )}
      </div>
    </form>
  )
}

/** The split parts as saved, or why they can't be: each needs a category and an amount, and they must add up. */
function readSplits(
  parts: readonly SplitDraft[],
  amount: number,
): { categoryId: string; amount: number }[] | string {
  const out: { categoryId: string; amount: number }[] = []
  for (const p of parts) {
    const paise = parseRupees(p.amount)
    if (!p.categoryId) return 'Pick a category for every part'
    if (paise === null || paise === 0) return 'Enter an amount for every part'
    out.push({ categoryId: p.categoryId, amount: paise })
  }
  const sum = out.reduce((s, p) => s + p.amount, 0)
  if (sum !== amount) {
    return `The parts add up to ${formatINR(sum)}, not ${formatINR(amount)}`
  }
  return out
}

/** One payment across several categories: a row per part, and what is left to assign. */
function SplitEditor({
  parts,
  amount,
  categories,
  error,
  onChange,
  onCancel,
}: {
  parts: SplitDraft[]
  amount: number
  categories: readonly Category[]
  error: string | undefined
  onChange: (parts: SplitDraft[]) => void
  onCancel: () => void
}) {
  const assigned = parts.reduce((s, p) => s + (parseRupees(p.amount) ?? 0), 0)
  const left = amount - assigned
  const update = (key: number, change: Partial<SplitDraft>) =>
    onChange(parts.map((p) => (p.key === key ? { ...p, ...change } : p)))

  return (
    <Field label="Split across categories" error={error} group>
      <div className="space-y-2">
        {parts.map((p, i) => (
          <div key={p.key} className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Select
                aria-label={`Category for part ${i + 1}`}
                value={p.categoryId}
                onChange={(e) => update(p.key, { categoryId: e.target.value })}
              >
                <option value="">Choose…</option>
                {categories.map((c) => (
                  <option
                    key={c.id}
                    value={c.id}
                    disabled={c.id !== p.categoryId && parts.some((x) => x.categoryId === c.id)}
                  >
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-32 shrink-0">
              <TextInput
                inputMode="decimal"
                aria-label={`Amount for part ${i + 1}`}
                placeholder={left > 0 && !p.amount ? paiseToInput(left) : '0'}
                value={p.amount}
                onChange={(e) => update(p.key, { amount: e.target.value })}
                className="text-right"
              />
            </div>
            <Button
              variant="ghost"
              className="h-10 px-2 text-[14px]"
              disabled={parts.length <= 2}
              onClick={() => onChange(parts.filter((x) => x.key !== p.key))}
              aria-label={`Remove part ${i + 1}`}
            >
              Remove
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[14px]">
          <span className="flex gap-4">
            <button
              type="button"
              className="text-accent"
              onClick={() => onChange([...parts, newPart()])}
            >
              Add part
            </button>
            <button type="button" className="text-muted" onClick={onCancel}>
              Don’t split
            </button>
          </span>
          <span className={cx('tabular-nums', left === 0 ? 'text-muted' : 'text-negative')}>
            {left === 0
              ? 'Parts add up'
              : left > 0
                ? `${formatINR(left)} left to assign`
                : `${formatINR(-left)} too much`}
          </span>
        </div>
      </div>
    </Field>
  )
}

/** Lets an income entry say which expense it pays back, so spending and savings stay accurate. */
function RefundPicker({
  value,
  selfId,
  categories,
  error,
  onChange,
}: {
  value: string
  selfId: string | undefined
  categories: readonly Category[]
  error: string | undefined
  onChange: (original: Transaction | null) => void
}) {
  const transactions = useAllTransactions()
  const expenses = (transactions ?? []).filter((t) => t.type === 'expense' && t.id !== selfId)
  // Newest first already; keep the list short enough to scan.
  const options = expenses.slice(0, 150)
  if (value && !options.some((t) => t.id === value)) {
    const chosen = expenses.find((t) => t.id === value)
    if (chosen) options.unshift(chosen)
  }
  const label = (t: Transaction) => {
    const category = categories.find((c) => c.id === t.categoryId)?.name ?? ''
    return `${formatShortDate(t.date, true)} · ${t.description || t.merchant || category} · ${formatINR(t.amount)}`
  }
  return (
    <Field
      label="Is this a refund or repayment?"
      error={error}
      hint="Pick the expense it pays back. It then reduces that spending and doesn’t count as income."
    >
      <Select
        value={value}
        onChange={(e) => onChange(options.find((t) => t.id === e.target.value) ?? null)}
      >
        <option value="">No, it’s new income</option>
        {options.map((t) => (
          <option key={t.id} value={t.id}>
            {label(t)}
          </option>
        ))}
      </Select>
    </Field>
  )
}

/** Optional links to loans, subscriptions and holdings; hidden until some exist. */
function TrackerLinks({
  form,
  set,
  errors,
}: {
  form: FormState
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void
  errors: Record<string, string>
}) {
  const loans = useLoans()?.filter((l) => l.active)
  const subscriptions = useSubscriptions()?.filter((s) => s.status !== 'cancelled')
  const holdings = useHoldings()?.filter((h) => !h.archived)
  const showLoans = form.type !== 'income' && (loans?.length ?? 0) > 0
  const showSubs = form.type === 'expense' && (subscriptions?.length ?? 0) > 0
  const showHoldings = form.type === 'transfer' && (holdings?.length ?? 0) > 0
  if (!showLoans && !showSubs && !showHoldings) return null

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {showLoans && (
        <Field label="Loan repayment" error={errors.loanId}>
          <Select value={form.loanId} onChange={(e) => set('loanId', e.target.value)}>
            <option value="">-</option>
            {loans?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {showSubs && (
        <Field label="Subscription" error={errors.subscriptionId}>
          <Select
            value={form.subscriptionId}
            onChange={(e) => set('subscriptionId', e.target.value)}
          >
            <option value="">-</option>
            {subscriptions?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.service}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {showHoldings && (
        <Field label="Invested in" error={errors.holdingId}>
          <Select value={form.holdingId} onChange={(e) => set('holdingId', e.target.value)}>
            <option value="">-</option>
            {holdings?.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </div>
  )
}

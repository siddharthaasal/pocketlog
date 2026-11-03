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
import { useAccounts, useCategories, useTransaction } from '../../data/hooks'
import {
  addTransaction,
  deleteTransaction,
  pickDefaultAccount,
  updateTransaction,
} from '../../data/repo'
import { toFieldErrors } from '../../domain/errors'
import { paiseToInput, parseRupees } from '../../domain/money'
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
import { todayISO } from '../../lib/dates'
import { goBack } from '../../lib/navigation'
import { resolveInboxEntry } from '../../data/inbox'
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
}

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
      categoryId: categories.find((c) => c.id === f.categoryId)?.type === type ? f.categoryId : '',
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
    const input: TransactionInput = {
      type: form.type,
      amount,
      description: form.description.trim(),
      categoryId: isTransfer ? undefined : form.categoryId || undefined,
      accountId: form.accountId,
      toAccountId: isTransfer ? form.toAccountId || undefined : undefined,
      date: form.date,
      merchant: form.merchant.trim() || undefined,
      paymentMethod: isTransfer ? undefined : form.paymentMethod || undefined,
      notes: form.notes.trim() || undefined,
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

  const hasDetails = Boolean(initial.merchant || initial.paymentMethod || initial.notes)

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
            className="block h-16 w-full rounded-2xl border border-border bg-surface pr-4 pl-11 text-[32px] font-semibold tabular-nums outline-none placeholder:text-muted/60 focus:border-accent"
          />
        </div>
      </Field>

      {!isTransfer && (
        <Field label="Category" error={errors.categoryId} group>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {visibleCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => set('categoryId', c.id)}
                aria-pressed={form.categoryId === c.id}
                className={cx(
                  'flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center text-[12px] leading-tight',
                  form.categoryId === c.id
                    ? 'border-accent bg-accent/10 text-text'
                    : 'border-transparent bg-surface text-muted',
                )}
              >
                <span className="text-[20px]" aria-hidden="true">
                  {c.icon}
                </span>
                {c.name}
              </button>
            ))}
          </div>
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
        <Card className="mt-3 space-y-4 bg-transparent">
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
                  <option value="">—</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
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

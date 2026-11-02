import { useState, type FormEvent } from 'react'
import { useLocation, useParams } from 'wouter'
import { Button, Field, Loading, PageHeader, Select, TextInput } from '../../components/ui'
import { useAccounts } from '../../data/hooks'
import { addAccount, updateAccount } from '../../data/repo'
import { toFieldErrors } from '../../domain/errors'
import { paiseToInput, parseRupees } from '../../domain/money'
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  type Account,
  type AccountType,
} from '../../domain/types'
import { goBack } from '../../lib/navigation'
import { parseWordList } from '../../lib/words'

export function AccountEditPage() {
  const { id } = useParams<{ id: string }>()
  const accounts = useAccounts()
  const existing = accounts?.find((a) => a.id === id)

  if (!accounts) return <Loading />
  if (id !== 'new' && !existing) {
    return (
      <>
        <PageHeader title="Account" back="/settings/accounts" />
        <p className="text-muted">Account not found.</p>
      </>
    )
  }
  return <AccountForm key={id} existing={existing} />
}

function AccountForm({ existing }: { existing: Account | undefined }) {
  const [, navigate] = useLocation()
  const [name, setName] = useState(existing?.name ?? '')
  const [type, setType] = useState<AccountType>(existing?.type ?? 'bank')
  // Credit cards are entered as "amount owed" (positive) and stored as a negative balance.
  const [opening, setOpening] = useState(
    existing ? paiseToInput(Math.abs(existing.openingBalance)) : '0',
  )
  const [aliases, setAliases] = useState(existing?.aliases.join(', ') ?? '')
  const [isDefault, setIsDefault] = useState(existing?.isDefault ?? false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isCard = type === 'credit_card'

  async function run(action: () => Promise<unknown>) {
    try {
      await action()
      goBack(navigate, '/settings/accounts')
    } catch (error) {
      setErrors(toFieldErrors(error) ?? { form: (error as Error).message })
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const amount = parseRupees(opening || '0')
    if (amount === null) {
      setErrors({ openingBalance: 'Enter an amount, e.g. 25000' })
      return
    }
    const fields = {
      name,
      type,
      openingBalance: isCard ? -amount : amount,
      aliases: parseWordList(aliases),
      isDefault,
    }
    void run(() => (existing ? updateAccount(existing.id, fields) : addAccount(fields)))
  }

  return (
    <>
      <PageHeader title={existing ? 'Edit account' : 'New account'} back="/settings/accounts" />
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Field label="Name" error={errors.name}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </Field>

        <Field label="Type" error={errors.type}>
          <Select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label={isCard ? 'Amount owed when you started tracking' : 'Opening balance'}
          error={errors.openingBalance}
          hint="The balance before your first transaction in PocketLog."
        >
          <TextInput
            inputMode="decimal"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
          />
        </Field>

        <Field
          label="Siri names"
          error={errors.aliases}
          hint="Comma-separated words you'd say for this account, e.g. hdfc, salary account."
        >
          <TextInput value={aliases} onChange={(e) => setAliases(e.target.value)} />
        </Field>

        {!existing?.archived && (
          <label className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
            <span className="text-[15px]">Default for new transactions</span>
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-5 w-5 accent-accent"
            />
          </label>
        )}

        {errors.form && <p className="text-[14px] text-negative">{errors.form}</p>}

        <div className="flex flex-col gap-2 pt-2">
          <Button type="submit" className="h-12">
            {existing ? 'Save changes' : 'Add account'}
          </Button>
          {existing && (
            <Button
              variant={existing.archived ? 'ghost' : 'danger'}
              onClick={() =>
                void run(() => updateAccount(existing.id, { archived: !existing.archived }))
              }
            >
              {existing.archived ? 'Restore account' : 'Archive account'}
            </Button>
          )}
        </div>
      </form>
    </>
  )
}

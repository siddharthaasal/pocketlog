import { useState, type FormEvent } from 'react'
import { useLocation, useParams } from 'wouter'
import {
  Button,
  Card,
  Field,
  Loading,
  PageHeader,
  Select,
  TextArea,
  TextInput,
} from '../../components/ui'
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
        <PageHeader title="Account" back="/accounts" />
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
  const [institution, setInstitution] = useState(existing?.institution ?? '')
  const [holder, setHolder] = useState(existing?.holder ?? '')
  const [last4, setLast4] = useState(existing?.last4 ?? '')
  const [nominee, setNominee] = useState(existing?.nominee ?? '')
  const [documentsNote, setDocumentsNote] = useState(existing?.documentsNote ?? '')
  const [openingDate, setOpeningDate] = useState(existing?.openingDate ?? '')
  const [creditLimit, setCreditLimit] = useState(
    existing?.creditLimit ? paiseToInput(existing.creditLimit) : '',
  )
  const [statementDay, setStatementDay] = useState(String(existing?.statementDay ?? ''))
  const [dueDay, setDueDay] = useState(String(existing?.dueDay ?? ''))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isCard = type === 'credit_card'

  async function run(action: () => Promise<unknown>) {
    try {
      await action()
      goBack(navigate, '/accounts')
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
    const limit = creditLimit.trim() ? parseRupees(creditLimit) : null
    if (isCard && creditLimit.trim() && limit === null) {
      setErrors({ creditLimit: 'Enter an amount, e.g. 150000' })
      return
    }
    const day = (value: string) => (value.trim() ? Number(value) : undefined)
    const fields = {
      name,
      type,
      openingBalance: isCard ? -amount : amount,
      aliases: parseWordList(aliases),
      isDefault,
      institution: institution.trim() || undefined,
      holder: holder.trim() || undefined,
      last4: last4.trim() || undefined,
      nominee: nominee.trim() || undefined,
      documentsNote: documentsNote.trim() || undefined,
      openingDate: openingDate || undefined,
      creditLimit: isCard ? (limit ?? undefined) : undefined,
      statementDay: isCard ? day(statementDay) : undefined,
      dueDay: isCard ? day(dueDay) : undefined,
    }
    void run(() => (existing ? updateAccount(existing.id, fields) : addAccount(fields)))
  }

  return (
    <>
      <PageHeader title={existing ? 'Edit account' : 'New account'} back="/accounts" />
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
          label="Opening balance date"
          error={errors.openingDate}
          hint="The day that balance was true. Leave blank if it’s before your first entry."
        >
          <TextInput
            type="date"
            value={openingDate}
            max="9999-12-31"
            onChange={(e) => setOpeningDate(e.target.value)}
          />
        </Field>

        <Field
          label="Siri names"
          error={errors.aliases}
          hint="Comma-separated words you'd say for this account, e.g. hdfc, salary account."
        >
          <TextInput value={aliases} onChange={(e) => setAliases(e.target.value)} />
        </Field>

        <details
          open={Boolean(
            existing &&
            (existing.institution ||
              existing.last4 ||
              existing.nominee ||
              existing.documentsNote ||
              existing.creditLimit),
          )}
          className="group"
        >
          <summary className="cursor-pointer list-none px-1 text-[15px] text-accent">
            <span className="group-open:hidden">More details</span>
            <span className="hidden group-open:inline">Fewer details</span>
          </summary>
          <Card className="mt-3 space-y-4 bg-transparent p-4">
            <p className="text-[13px] text-muted">
              Only what you’d want to find later. Never store passwords, PINs or full account
              numbers here.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Bank or institution" error={errors.institution}>
                <TextInput value={institution} onChange={(e) => setInstitution(e.target.value)} />
              </Field>
              <Field label="Account holder" error={errors.holder}>
                <TextInput value={holder} onChange={(e) => setHolder(e.target.value)} />
              </Field>
              <Field label="Last 4 digits" error={errors.last4}>
                <TextInput
                  inputMode="numeric"
                  maxLength={4}
                  value={last4}
                  onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))}
                />
              </Field>
              <Field label="Nominee" error={errors.nominee}>
                <TextInput value={nominee} onChange={(e) => setNominee(e.target.value)} />
              </Field>
            </div>
            {isCard && (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Credit limit" error={errors.creditLimit}>
                  <TextInput
                    inputMode="decimal"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                  />
                </Field>
                <Field label="Statement day" error={errors.statementDay}>
                  <TextInput
                    inputMode="numeric"
                    maxLength={2}
                    value={statementDay}
                    onChange={(e) => setStatementDay(e.target.value.replace(/\D/g, ''))}
                  />
                </Field>
                <Field label="Due day" error={errors.dueDay}>
                  <TextInput
                    inputMode="numeric"
                    maxLength={2}
                    value={dueDay}
                    onChange={(e) => setDueDay(e.target.value.replace(/\D/g, ''))}
                  />
                </Field>
              </div>
            )}
            <Field label="Where the documents are" error={errors.documentsNote}>
              <TextArea
                value={documentsNote}
                onChange={(e) => setDocumentsNote(e.target.value)}
                placeholder="Optional"
              />
            </Field>
          </Card>
        </details>

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

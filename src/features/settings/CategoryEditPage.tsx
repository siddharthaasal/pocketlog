import { useState, type FormEvent } from 'react'
import { useLocation, useParams, useSearchParams } from 'wouter'
import {
  Button,
  CategoryBadge,
  Field,
  Loading,
  PageHeader,
  Segmented,
  TextInput,
} from '../../components/ui'
import { cx } from '../../lib/cx'
import { useCategories } from '../../data/hooks'
import { addCategory, updateCategory } from '../../data/repo'
import { toFieldErrors } from '../../domain/errors'
import type { Category, CategoryType } from '../../domain/types'
import { goBack } from '../../lib/navigation'
import { parseWordList } from '../../lib/words'

// prettier-ignore
const COLORS = [
  '#e8590c', '#f08c00', '#2f9e44', '#087f5b', '#0c8599', '#1971c2',
  '#3b5bdb', '#5f3dc4', '#9c36b5', '#c2255c', '#e03131', '#868e96',
]

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
] as const

export function CategoryEditPage() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const categories = useCategories()
  const isNew = id === 'new'
  const existing = categories?.find((c) => c.id === id)

  if (!categories) return <Loading />
  if (!isNew && !existing) {
    return (
      <>
        <PageHeader title="Category" back="/settings/categories" />
        <p className="text-muted">Category not found.</p>
      </>
    )
  }

  return (
    <CategoryForm
      key={id}
      existing={existing}
      initialType={params.get('type') === 'income' ? 'income' : 'expense'}
    />
  )
}

function CategoryForm({
  existing,
  initialType,
}: {
  existing: Category | undefined
  initialType: CategoryType
}) {
  const [, navigate] = useLocation()
  const [type, setType] = useState<CategoryType>(existing?.type ?? initialType)
  const [name, setName] = useState(existing?.name ?? '')
  const [icon, setIcon] = useState(existing?.icon ?? '📦')
  const [color, setColor] = useState(existing?.color ?? COLORS[0]!)
  const [keywords, setKeywords] = useState(existing?.keywords.join(', ') ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const back = `/settings/categories?type=${type}`

  async function run(action: () => Promise<unknown>) {
    try {
      await action()
      goBack(navigate, back)
    } catch (error) {
      setErrors(toFieldErrors(error) ?? { form: (error as Error).message })
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const fields = { name, icon, color, keywords: parseWordList(keywords) }
    void run(() =>
      existing ? updateCategory(existing.id, fields) : addCategory({ ...fields, type }),
    )
  }

  return (
    <>
      <PageHeader title={existing ? 'Edit category' : 'New category'} back={back} />
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {!existing && <Segmented value={type} options={TYPE_OPTIONS} onChange={setType} />}

        <div className="flex items-end gap-3">
          <CategoryBadge icon={icon || '?'} color={color} />
          <div className="flex-1">
            <Field label="Name" error={errors.name}>
              <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            </Field>
          </div>
          <div className="w-20">
            <Field label="Icon" error={errors.icon}>
              <TextInput
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="text-center"
                aria-label="Emoji icon"
              />
            </Field>
          </div>
        </div>

        <Field label="Colour" group>
          <div className="flex flex-wrap gap-2.5">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={c === color}
                onClick={() => setColor(c)}
                className={cx(
                  'h-8 w-8 rounded-full ring-offset-2 ring-offset-bg',
                  c === color && 'ring-2 ring-text',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </Field>

        <Field
          label="Siri keywords"
          error={errors.keywords}
          hint="Comma-separated words that should map to this category, e.g. lunch, swiggy."
        >
          <TextInput value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        </Field>

        {errors.form && <p className="text-[14px] text-negative">{errors.form}</p>}

        <div className="flex flex-col gap-2 pt-2">
          <Button type="submit" className="h-12">
            {existing ? 'Save changes' : 'Add category'}
          </Button>
          {existing && (
            <Button
              variant={existing.archived ? 'ghost' : 'danger'}
              onClick={() =>
                void run(() => updateCategory(existing.id, { archived: !existing.archived }))
              }
            >
              {existing.archived ? 'Restore category' : 'Archive category'}
            </Button>
          )}
        </div>
        {existing && !existing.archived && (
          <p className="px-1 text-[13px] text-muted">
            Archived categories are hidden when adding transactions. Past transactions keep them.
          </p>
        )}
      </form>
    </>
  )
}

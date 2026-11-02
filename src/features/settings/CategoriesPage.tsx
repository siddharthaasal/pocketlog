import { Link, useSearchParams } from 'wouter'
import {
  Card,
  CategoryBadge,
  Loading,
  PageHeader,
  SectionTitle,
  Segmented,
} from '../../components/ui'
import { useCategories } from '../../data/hooks'
import type { CategoryType } from '../../domain/types'
import { SettingsRow } from './SettingsList'

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
] as const

export function CategoriesPage() {
  const categories = useCategories()
  const [params, setParams] = useSearchParams()
  const type: CategoryType = params.get('type') === 'income' ? 'income' : 'expense'

  const ofType = categories?.filter((c) => c.type === type) ?? []
  const active = ofType.filter((c) => !c.archived)
  const archived = ofType.filter((c) => c.archived)

  return (
    <>
      <PageHeader
        title="Categories"
        back="/settings"
        action={
          <Link
            href={`/settings/categories/new?type=${type}`}
            className="text-[15px] font-medium text-accent"
          >
            New
          </Link>
        }
      />
      <div className="space-y-6">
        <Segmented
          value={type}
          options={TYPE_OPTIONS}
          onChange={(t) => setParams({ type: t }, { replace: true })}
        />
        {!categories ? (
          <Loading />
        ) : (
          <>
            <Card className="divide-y divide-border overflow-hidden">
              {active.map((c) => (
                <SettingsRow
                  key={c.id}
                  href={`/settings/categories/${c.id}`}
                  leading={<CategoryBadge icon={c.icon} color={c.color} />}
                  title={c.name}
                />
              ))}
            </Card>
            {archived.length > 0 && (
              <section>
                <SectionTitle>Archived</SectionTitle>
                <Card className="divide-y divide-border overflow-hidden">
                  {archived.map((c) => (
                    <SettingsRow
                      key={c.id}
                      href={`/settings/categories/${c.id}`}
                      leading={<CategoryBadge icon={c.icon} color={c.color} />}
                      title={<span className="text-muted">{c.name}</span>}
                    />
                  ))}
                </Card>
              </section>
            )}
          </>
        )}
      </div>
    </>
  )
}

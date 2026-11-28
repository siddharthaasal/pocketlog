import { useMemo, useState } from 'react'
import {
  CellInput,
  NumberGlyph,
  SelectGlyph,
  Table,
  Tag,
  TextGlyph,
  Td,
  Th,
  Tr,
} from '../../components/table'
import { CategoryIcon } from '../../components/categoryIcons'
import { Button, Loading, Money, PageHeader } from '../../components/ui'
import { useCategories, useTransactionsInMonth } from '../../data/hooks'
import { setCategoryBudgets } from '../../data/repo'
import { budgetRows, monthProgress } from '../../domain/budgets'
import { formatINR, paiseToInput, parseRupees } from '../../domain/money'
import { summarize } from '../../domain/summary'
import { cx } from '../../lib/cx'
import { formatMonth, todayISO } from '../../lib/dates'
import { MonthSwitcher } from '../shared/MonthSwitcher'
import { useMonthParam } from '../shared/useMonthParam'
import { BudgetBar } from './BudgetBar'
import { BUDGET_COLORS } from './budgetStyle'

export function BudgetsPage() {
  const [month, setMonth] = useMonthParam()
  const categories = useCategories()
  const transactions = useTransactionsInMonth(month)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  const spending = useMemo(
    () =>
      new Map(summarize(transactions ?? []).expenseByCategory.map((s) => [s.categoryId, s.amount])),
    [transactions],
  )

  if (!categories || !transactions) {
    return (
      <>
        <PageHeader title="Budgets" />
        <Loading />
      </>
    )
  }

  const expense = categories.filter((c) => c.type === 'expense' && !c.archived)
  const rows = budgetRows(
    expense,
    [...spending].map(([categoryId, amount]) => ({ categoryId, amount })),
  )
  const byId = new Map(rows.map((r) => [r.category.id, r]))
  // Budgeted categories first, most used first; then the rest by name.
  const ordered = [...rows.map((r) => r.category), ...expense.filter((c) => !byId.has(c.id))]
  const pace = monthProgress(month, todayISO())
  const budgeted = rows.reduce((sum, r) => sum + r.budget, 0)
  const spentInBudgets = rows.reduce((sum, r) => sum + r.spent, 0)
  const spentTotal = [...spending.values()].reduce((a, b) => a + b, 0)

  function startEditing() {
    setDraft(Object.fromEntries(expense.map((c) => [c.id, c.budget ? paiseToInput(c.budget) : ''])))
    setError('')
    setEditing(true)
  }

  async function save() {
    const next: { id: string; budget: number | undefined }[] = []
    for (const c of expense) {
      const raw = (draft[c.id] ?? '').trim()
      const paise = raw === '' ? 0 : parseRupees(raw)
      if (paise === null) return setError(`Check the budget for ${c.name}, e.g. 5000`)
      next.push({ id: c.id, budget: paise > 0 ? paise : undefined })
    }
    await setCategoryBudgets(next)
    setEditing(false)
  }

  return (
    <>
      <PageHeader
        title="Budgets"
        action={
          editing ? (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="h-8 px-3 text-[13.5px]"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
              <Button className="h-8 px-3 text-[13.5px]" onClick={() => void save()}>
                Save budgets
              </Button>
            </div>
          ) : (
            <Button variant="secondary" className="h-8 px-3 text-[13.5px]" onClick={startEditing}>
              Edit budgets
            </Button>
          )
        }
      />
      <div className="space-y-4">
        <MonthSwitcher month={month} onChange={setMonth} as="h2" />
        <p className="px-1 text-[13px] text-muted">
          {editing
            ? 'A monthly limit for each category. Leave it empty for no budget.'
            : rows.length === 0
              ? 'No budgets yet. Edit budgets to set a monthly limit for the categories you want to watch.'
              : `${formatINR(spentInBudgets)} of ${formatINR(budgeted)} budgeted spent in ${formatMonth(month)}. A budget turns orange at 80% and red once it is over; the line marks an even pace through the month.`}
        </p>
        {error && editing && (
          <p role="alert" className="px-1 text-[13px] text-negative">
            {error}
          </p>
        )}
        <Table minWidth={620}>
          <thead>
            <tr>
              <Th icon={<TextGlyph />}>Category</Th>
              <Th className="w-28" icon={<NumberGlyph />}>
                Budget
              </Th>
              <Th className="w-28" icon={<NumberGlyph />}>
                Spent
              </Th>
              <Th className="w-28" icon={<NumberGlyph />}>
                Left
              </Th>
              <Th className="w-40" icon={<SelectGlyph />}>
                Used
              </Th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((c) => {
              const r = byId.get(c.id)
              const spent = spending.get(c.id) ?? 0
              return (
                <Tr key={c.id}>
                  <Td className="max-w-0">
                    <Tag color={c.color}>
                      <CategoryIcon icon={c.icon} size={13} className="inline" /> {c.name}
                    </Tag>
                  </Td>
                  <Td className="text-right">
                    {editing ? (
                      <CellInput
                        inputMode="decimal"
                        aria-label={`Budget for ${c.name}`}
                        placeholder="No budget"
                        value={draft[c.id] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                        className="text-right"
                      />
                    ) : r ? (
                      <Money paise={r.budget} />
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </Td>
                  <Td className={cx('text-right', !r && 'text-muted')}>
                    <Money paise={spent} />
                  </Td>
                  <Td className={cx('text-right', r?.status === 'over' && 'text-negative')}>
                    {r ? (
                      r.left >= 0 ? (
                        formatINR(r.left)
                      ) : (
                        `−${formatINR(-r.left)}`
                      )
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </Td>
                  <Td>
                    {r && (
                      <span className="flex items-center gap-2">
                        <BudgetBar used={r.used} status={r.status} pace={pace} className="flex-1" />
                        {r.status !== 'ok' ? (
                          <Tag
                            color={BUDGET_COLORS[r.status]}
                            title={r.status === 'over' ? 'Over budget' : 'Close to budget'}
                          >
                            {Math.round(r.used * 100)}%
                          </Tag>
                        ) : (
                          <span className="w-10 text-right text-[13px] text-muted tabular-nums">
                            {Math.round(r.used * 100)}%
                          </span>
                        )}
                      </span>
                    )}
                  </Td>
                </Tr>
              )
            })}
            <Tr>
              <Td className="font-medium">Total</Td>
              <Td className="text-right text-muted">
                {budgeted > 0 ? <Money paise={budgeted} /> : '-'}
              </Td>
              <Td className="text-right font-medium">
                <Money paise={spentTotal} />
              </Td>
              <Td className="text-right text-muted">
                {budgeted > 0 ? <Money paise={budgeted - spentInBudgets} /> : '-'}
              </Td>
              <Td />
            </Tr>
          </tbody>
        </Table>
      </div>
    </>
  )
}

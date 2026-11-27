import type { ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import { PageHeader } from '../../components/ui'
import { cx } from '../../lib/cx'

/** Sections of the Wealth area, in tab order. Each phase of the tracker adds its own. */
export const WEALTH_SECTIONS = [{ href: '/wealth/investments', label: 'Investments' }] as const

export function WealthShell({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const [location] = useLocation()
  return (
    <>
      <PageHeader title="Wealth" action={action} />
      <nav
        aria-label="Wealth sections"
        className="mb-6 flex flex-wrap items-center gap-1 border-b border-border pb-2"
      >
        {WEALTH_SECTIONS.map((s) => {
          const active = location.startsWith(s.href)
          return (
            <Link
              key={s.href}
              href={s.href}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'inline-flex h-8 items-center rounded-full px-3 text-[14px]',
                active ? 'bg-surface-2 font-medium text-text' : 'text-muted hover:bg-surface-2/60',
              )}
            >
              {s.label}
            </Link>
          )
        })}
      </nav>
      <div className="space-y-6">{children}</div>
    </>
  )
}

/** A small labelled figure for the strip at the top of a Wealth page. */
export function Stat({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: ReactNode
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface px-4 py-3">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-0.5 text-[22px] font-semibold tracking-tight tabular-nums">{children}</div>
      {hint && <div className="mt-0.5 text-[12.5px] text-muted">{hint}</div>}
    </div>
  )
}

export const percent = (value: number | null, digits = 1) =>
  value === null ? '—' : `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}%`

export const bpsText = (bps: number | null) =>
  bps === null ? '—' : `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`

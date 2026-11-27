import type { ReactNode } from 'react'
import { cx } from '../lib/cx'

/*
 * A flat, Notion-style database table: no card, hairline rows, light column dividers,
 * muted headers with small property-type icons, single-line rows, pill tags.
 * Wider than its frame, it scrolls sideways (as Notion does on a phone).
 */

export function Table({ children, minWidth = 760 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto border-y border-border bg-surface">
      <table className="w-full border-collapse text-[14px]" style={{ minWidth }}>
        {children}
      </table>
    </div>
  )
}

export function Th({
  children,
  icon,
  className,
}: {
  children?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <th
      className={cx(
        'h-9 border-r border-b border-border px-2 text-left text-[13.5px] font-normal whitespace-nowrap text-muted last:border-r-0',
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        {icon}
        {children}
      </span>
    </th>
  )
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <td
      className={cx(
        'h-[34px] truncate border-r border-b border-border px-2 align-middle whitespace-nowrap last:border-r-0',
        className,
      )}
    >
      {children}
    </td>
  )
}

export const Tr = ({
  children,
  selected = false,
  onClick,
}: {
  children: ReactNode
  selected?: boolean
  /** Makes the whole row a button, like opening a Notion row. */
  onClick?: () => void
}) => (
  <tr
    onClick={onClick}
    className={cx(
      'hover:bg-surface-2/50 [&:last-child_td]:border-b-0',
      selected && 'bg-accent/5',
      onClick && 'cursor-pointer',
    )}
  >
    {children}
  </tr>
)

const tint = (color?: string) => `${color ?? '#868e96'}26`

/** A rounded, tinted pill, like a Notion select value. */
export function Tag({
  color,
  children,
  title,
}: {
  color?: string | undefined
  children: ReactNode
  title?: string
}) {
  return (
    <span
      title={title}
      className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2.5 py-0.5 text-[13.5px]"
      style={{ backgroundColor: tint(color) }}
    >
      {children}
    </span>
  )
}

/** A native select dressed as a tag, so it stays accessible and works on a phone. */
export function TagSelect({
  color,
  className,
  children,
  ...props
}: {
  color?: string | undefined
  children: ReactNode
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative inline-block max-w-full">
      <select
        {...props}
        className={cx(
          'h-[26px] max-w-[12.5rem] cursor-pointer appearance-none rounded-full py-0 pr-6 pl-2.5 text-[13.5px] text-text outline-none focus:ring-2 focus:ring-accent',
          className,
        )}
        style={{ backgroundColor: tint(color) }}
      >
        {children}
      </select>
      <svg
        viewBox="0 0 10 10"
        width={9}
        height={9}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 opacity-50"
      >
        <path d="m2 3.5 3 3 3-3" />
      </svg>
    </span>
  )
}

export function SmallButton({
  tone = 'plain',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'plain' | 'primary' | 'danger' }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'h-7 rounded-md px-1.5 text-[13px] whitespace-nowrap transition-colors disabled:opacity-40',
        tone === 'primary' && 'bg-accent font-medium text-accent-fg hover:opacity-90',
        tone === 'plain' && 'text-muted hover:bg-surface-2 hover:text-text',
        tone === 'danger' && 'text-negative hover:bg-surface-2',
        props.className,
      )}
    />
  )
}

/** Notion-style view tabs: a soft pill on the active one, counts in muted text. */
export function ViewTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: readonly { value: T; label: string; count: number }[]
  onChange: (value: T) => void
}) {
  return (
    <div role="tablist" className="flex flex-wrap items-center gap-1 border-b border-border pb-2">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex h-8 items-center gap-2 rounded-full px-3 text-[14px] transition-colors',
              active ? 'bg-surface-2 font-medium text-text' : 'text-muted hover:bg-surface-2/60',
            )}
          >
            <TableGlyph />
            {o.label}
            <span className="font-normal text-muted">{o.count}</span>
          </button>
        )
      })}
    </div>
  )
}

// ---------- Property-type glyphs (shown in column headers) ----------

const glyph = (children: ReactNode) => (
  <svg
    viewBox="0 0 16 16"
    width={14}
    height={14}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.4}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

export const TableGlyph = () =>
  glyph(
    <>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M2 7h12M6.5 7v6" />
    </>,
  )
export const CalendarGlyph = () =>
  glyph(
    <>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M2.5 7h11M5.5 2v3M10.5 2v3" />
    </>,
  )
export const TextGlyph = () => (
  <span aria-hidden="true" className="text-[11px] leading-none font-semibold tracking-tight">
    Aa
  </span>
)
export const NumberGlyph = () => glyph(<path d="M6 3 5 13M11 3l-1 10M3 6h10M2.5 10h10" />)
export const SelectGlyph = () =>
  glyph(
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="m6 7 2 2 2-2" />
    </>,
  )

/** The small grey dot Notion puts in front of a status tag. */
export const Dot = ({ color = '#9b9a97' }: { color?: string }) => (
  <span
    aria-hidden="true"
    className="inline-block h-2 w-2 shrink-0 rounded-full"
    style={{ backgroundColor: color }}
  />
)

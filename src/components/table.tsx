import { CalendarDays, CircleChevronDown, Hash, Table2, Type } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '../lib/cx'
import { FitSelect } from './ui'

/*
 * A flat, Notion-style database table: no card, hairline rows, light column dividers,
 * muted headers with small property-type icons, single-line rows, pill tags.
 * Wider than its frame, it scrolls sideways (as Notion does on a phone).
 */

export function Table({ children, minWidth = 760 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto border-y border-border">
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

export function Td({
  children,
  className,
  onClick,
}: {
  children?: ReactNode
  className?: string
  onClick?: (e: React.MouseEvent<HTMLTableCellElement>) => void
}) {
  return (
    <td
      onClick={onClick}
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

/** A dropdown dressed as a tag; as wide as the chosen value, not its longest option. */
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
    <FitSelect
      {...props}
      className={cx('h-[26px] rounded-full pr-2 pl-2.5 text-[13.5px] text-text', className)}
      style={{ backgroundColor: tint(color) }}
    >
      {children}
    </FitSelect>
  )
}

/**
 * A text field that is part of the cell: no box or fill until it has focus, like editing in
 * Notion. Phones keep the global 16px so iOS doesn't zoom in; wider screens match the table.
 */
export function CellInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        '-mx-1 block w-[calc(100%+0.5rem)] rounded bg-transparent px-1 py-0.5 outline-none md:text-[14px]! placeholder:text-muted focus:bg-bg focus:ring-2 focus:ring-accent',
        className,
      )}
    />
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

const GLYPH = { size: 14, strokeWidth: 1.6, color: 'var(--icon)', 'aria-hidden': true } as const

export const TableGlyph = () => <Table2 {...GLYPH} />
export const CalendarGlyph = () => <CalendarDays {...GLYPH} />
export const TextGlyph = () => <Type {...GLYPH} />
export const NumberGlyph = () => <Hash {...GLYPH} />
export const SelectGlyph = () => <CircleChevronDown {...GLYPH} />

/** The small grey dot Notion puts in front of a status tag. */
export const Dot = ({ color = '#9b9a97' }: { color?: string }) => (
  <span
    aria-hidden="true"
    className="inline-block h-2 w-2 shrink-0 rounded-full"
    style={{ backgroundColor: color }}
  />
)

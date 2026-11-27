import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

/** Notion-style table: hairline rows, muted headers, scrolls sideways on a phone. */
export function Table({ children, minWidth = 760 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table
        className="w-full border-collapse text-[14px] [&_tbody_tr:last-child_td]:border-b-0"
        style={{ minWidth }}
      >
        {children}
      </table>
    </div>
  )
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={cx(
        'border-b border-border px-3 py-2 text-left text-[12px] font-normal whitespace-nowrap text-muted',
        className,
      )}
    >
      {children}
    </th>
  )
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <td className={cx('border-b border-border px-3 py-1.5 align-middle', className)}>{children}</td>
  )
}

export const Tr = ({ children, selected = false }: { children: ReactNode; selected?: boolean }) => (
  <tr className={cx('hover:bg-surface-2/60', selected && 'bg-accent/5')}>{children}</tr>
)

const tint = (color?: string) => `${color ?? '#868e96'}26`

/** A coloured pill, like a Notion select property. */
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
      className="inline-flex max-w-full items-center gap-1 truncate rounded-md px-2 py-0.5 text-[13px]"
      style={{ backgroundColor: tint(color) }}
    >
      {children}
    </span>
  )
}

/** A native select dressed as a Notion tag, so it stays accessible and works on a phone. */
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
          'h-7 max-w-full cursor-pointer appearance-none rounded-md py-0 pr-6 pl-2 text-[13px] text-text outline-none focus:ring-2 focus:ring-accent',
          className,
        )}
        style={{ backgroundColor: tint(color) }}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[9px] opacity-50">
        ▾
      </span>
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
        'h-7 rounded-md px-2 text-[13px] whitespace-nowrap transition-colors disabled:opacity-40',
        tone === 'primary' && 'bg-accent font-medium text-accent-fg hover:opacity-90',
        tone === 'plain' && 'text-accent hover:bg-surface-2',
        tone === 'danger' && 'text-negative hover:bg-surface-2',
        props.className,
      )}
    />
  )
}

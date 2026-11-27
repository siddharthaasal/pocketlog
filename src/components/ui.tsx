import {
  Children,
  isValidElement,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Link } from 'wouter'
import { formatINR } from '../domain/money'
import { cx } from '../lib/cx'
import { ChevronLeftIcon } from './icons'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:opacity-90',
  secondary: 'border border-border bg-surface text-text hover:bg-surface-2',
  ghost: 'text-accent hover:bg-surface-2',
  danger: 'text-negative hover:bg-surface-2',
}

export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-[14.5px] font-medium transition-colors disabled:opacity-40',
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-xl border border-border bg-surface', className)}>{children}</div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between px-1">
      <h2 className="text-[13px] font-medium text-muted">{children}</h2>
      {action}
    </div>
  )
}

export function PageHeader({
  title,
  back,
  action,
}: {
  title: ReactNode
  back?: string
  action?: ReactNode
}) {
  return (
    <header className="mb-5 flex min-h-11 items-center gap-2">
      {back && (
        <Link
          href={back}
          className="-ml-2 flex h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
          aria-label="Back"
        >
          <ChevronLeftIcon />
        </Link>
      )}
      <h1 className="flex-1 text-[30px] leading-tight font-bold tracking-[-0.03em]">{title}</h1>
      {action}
    </header>
  )
}

export function Field({
  label,
  error,
  hint,
  group = false,
  children,
}: {
  label: string
  error?: string | undefined
  hint?: string
  /**
   * Use for several controls (e.g. a grid of buttons). A <label> would forward every
   * click inside it to its first control, so groups render as a labelled <div> instead.
   */
  group?: boolean
  children: ReactNode
}) {
  const Wrapper = group ? 'div' : 'label'
  return (
    <Wrapper className="block" {...(group ? { role: 'group', 'aria-label': label } : {})}>
      <span className="mb-1.5 block px-1 text-[13px] font-medium text-muted">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block px-1 text-[13px] text-negative">{error}</span>
      ) : (
        hint && <span className="mt-1.5 block px-1 text-[13px] text-muted">{hint}</span>
      )}
    </Wrapper>
  )
}

const inputClass =
  'block w-full rounded-md border border-border bg-surface px-3 py-2 text-text outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20'

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputClass, 'h-10', className)} {...props} />
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputClass, 'min-h-20', className)} {...props} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(inputClass, 'h-10 appearance-none', className)} {...props} />
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="flex rounded-lg bg-surface-2 p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-8 flex-1 rounded-md text-[14px] font-medium transition-colors',
            o.value === value ? 'bg-surface text-text shadow-sm' : 'text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Money({
  paise,
  signed = false,
  className,
}: {
  paise: number
  /** Show income as "+₹…" in green. */
  signed?: boolean
  className?: string
}) {
  return (
    <span className={cx('tabular-nums', signed && paise > 0 && 'text-positive', className)}>
      {signed && paise > 0 ? '+' : ''}
      {formatINR(paise)}
    </span>
  )
}

export function CategoryBadge({ icon, color }: { icon: string; color: string }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[16px]"
      style={{ backgroundColor: `${color}1f` }}
      aria-hidden="true"
    >
      {icon}
    </span>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-6 py-10 text-center">
      <p className="text-[15px] text-muted">{title}</p>
      {children}
    </div>
  )
}

export function Loading() {
  return <div className="py-16 text-center text-[15px] text-muted">Loading…</div>
}

const textOf = (node: ReactNode): string =>
  Children.toArray(node)
    .map((c) =>
      typeof c === 'string' || typeof c === 'number'
        ? String(c)
        : isValidElement(c)
          ? textOf((c.props as { children?: ReactNode }).children)
          : '',
    )
    .join('')

/** The visible text of the <option> whose value is selected, looking inside <optgroup>s. */
function selectedLabel(children: ReactNode, value: unknown): string | undefined {
  let found: string | undefined
  Children.forEach(children, (child) => {
    if (found !== undefined || !isValidElement(child)) return
    const props = child.props as { value?: unknown; children?: ReactNode }
    if (child.type === 'option') {
      if (String(props.value ?? textOf(props.children)) === String(value ?? '')) {
        found = textOf(props.children)
      }
    } else if (props.children) {
      found = selectedLabel(props.children, value)
    }
  })
  return found
}

/**
 * A dropdown that is only as wide as the option you picked, instead of as wide as its longest
 * option. A real <select> sits invisibly on top of the label, so it stays accessible and still
 * opens the native picker on a phone.
 */
export function FitSelect({
  className,
  style,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { style?: CSSProperties }) {
  return (
    <span
      style={style}
      className={cx(
        'relative inline-flex max-w-full items-center gap-1.5 whitespace-nowrap has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent has-[:focus-visible]:ring-inset',
        className,
      )}
    >
      <span className="truncate">{selectedLabel(children, props.value)}</span>
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
        className="shrink-0 opacity-50"
      >
        <path d="m2 3.5 3 3 3-3" />
      </svg>
      <select {...props} className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
        {children}
      </select>
    </span>
  )
}

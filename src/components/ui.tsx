import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { Link } from 'wouter'
import { formatINR } from '../domain/money'
import { cx } from '../lib/cx'
import { ChevronLeftIcon } from './icons'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:opacity-90',
  secondary: 'bg-surface-2 text-text hover:opacity-80',
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
        'inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-medium transition-opacity disabled:opacity-40',
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-2xl bg-surface', className)}>{children}</div>
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between px-1">
      <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted">{children}</h2>
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
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-accent hover:bg-surface-2"
          aria-label="Back"
        >
          <ChevronLeftIcon />
        </Link>
      )}
      <h1 className="flex-1 text-[28px] font-semibold tracking-tight">{title}</h1>
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
  'block w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-text outline-none placeholder:text-muted focus:border-accent'

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputClass, 'h-11', className)} {...props} />
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputClass, 'min-h-20', className)} {...props} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(inputClass, 'h-11 appearance-none', className)} {...props} />
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
    <div className="flex rounded-xl bg-surface-2 p-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-9 flex-1 rounded-lg text-[14px] font-medium transition-colors',
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
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[17px]"
      style={{ backgroundColor: `${color}1f` }}
      aria-hidden="true"
    >
      {icon}
    </span>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface px-6 py-10 text-center">
      <p className="text-[15px] text-muted">{title}</p>
      {children}
    </div>
  )
}

export function Loading() {
  return <div className="py-16 text-center text-[15px] text-muted">Loading…</div>
}

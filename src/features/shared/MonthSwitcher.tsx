import { ChevronLeftIcon, ChevronRightIcon } from '../../components/icons'
import { currentMonth, formatMonth, shiftMonth } from '../../lib/dates'

export function MonthSwitcher({
  month,
  onChange,
  as: Heading = 'h1',
}: {
  month: string
  onChange: (month: string) => void
  as?: 'h1' | 'h2'
}) {
  const isCurrent = month >= currentMonth()
  return (
    <div className="flex items-center justify-between">
      <Heading
        className={
          Heading === 'h1'
            ? 'text-[28px] font-semibold tracking-tight'
            : 'text-[17px] font-semibold tracking-tight'
        }
      >
        {formatMonth(month)}
      </Heading>
      <div className="flex">
        <MonthButton label="Previous month" onClick={() => onChange(shiftMonth(month, -1))}>
          <ChevronLeftIcon />
        </MonthButton>
        <MonthButton
          label="Next month"
          disabled={isCurrent}
          onClick={() => onChange(shiftMonth(month, 1))}
        >
          <ChevronRightIcon />
        </MonthButton>
      </div>
    </div>
  )
}

function MonthButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-full text-accent hover:bg-surface-2 disabled:text-muted disabled:opacity-40"
    >
      {children}
    </button>
  )
}

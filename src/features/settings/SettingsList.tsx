import type { ReactNode } from 'react'
import { Link } from 'wouter'
import { ChevronRightIcon } from '../../components/icons'

export function SettingsRow({
  href,
  leading,
  title,
  detail,
}: {
  href?: string
  leading?: ReactNode
  title: ReactNode
  detail?: ReactNode
}) {
  const content = (
    <>
      {leading}
      <span className="min-w-0 flex-1 truncate text-[15px]">{title}</span>
      {detail && <span className="text-[15px] text-muted">{detail}</span>}
      {href && <ChevronRightIcon width={18} height={18} className="text-muted" />}
    </>
  )
  const className = 'flex min-h-12 items-center gap-3 px-4 py-2'
  return href ? (
    <Link href={href} className={`${className} hover:bg-surface-2/60`}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  )
}

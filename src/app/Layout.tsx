import type { ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import {
  ChartIcon,
  HomeIcon,
  ListIcon,
  PlusIcon,
  ReconcileIcon,
  SettingsIcon,
  WealthIcon,
} from '../components/icons'
import { cx } from '../lib/cx'
import { UpdatePrompt } from './UpdatePrompt'

const NAV = [
  { href: '/', label: 'Home', icon: HomeIcon },
  { href: '/transactions', label: 'Transactions', icon: ListIcon },
  { href: '/analytics', label: 'Analytics', icon: ChartIcon },
  { href: '/wealth', label: 'Wealth', icon: WealthIcon },
  { href: '/reconcile', label: 'Reconcile', icon: ReconcileIcon },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
] as const

/** Six items fit a phone's tab bar; Reconcile is a desktop task and lives in Settings there. */
const MOBILE_NAV = NAV.filter((item) => item.href !== '/reconcile')

function isActive(location: string, href: string) {
  return href === '/' ? location === '/' : location.startsWith(href)
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation()

  return (
    <div className="md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-0.5 border-r border-border px-2.5 py-5 md:flex">
        <div className="mb-5 flex items-center gap-2 px-2.5 text-[15px] font-semibold tracking-tight">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-text text-[11px] text-bg">
            P
          </span>
          PocketLog
        </div>
        <Link
          href="/add"
          className="mb-3 flex h-9 items-center justify-center gap-2 rounded-lg bg-accent text-[14px] font-medium text-accent-fg hover:opacity-90"
        >
          <PlusIcon width={18} height={18} /> Add transaction
        </Link>
        {NAV.map(({ href, label, icon: NavIcon }) => (
          <Link
            key={href}
            href={href}
            className={cx(
              'flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[14.5px]',
              isActive(location, href)
                ? 'bg-surface-2 font-medium text-text'
                : 'text-muted hover:bg-surface-2/60 hover:text-text',
            )}
          >
            <NavIcon width={18} height={18} /> {label}
          </Link>
        ))}
      </aside>

      <main
        className={cx(
          'mx-auto w-full min-w-0 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))] md:pt-8 md:pb-12',
          location.startsWith('/reconcile') || location.startsWith('/wealth')
            ? 'max-w-6xl md:px-5'
            : location === '/transactions'
              ? 'max-w-5xl md:px-6'
              : 'max-w-3xl md:px-8',
        )}
      >
        {children}
      </main>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        {MOBILE_NAV.slice(0, 2).map((item) => (
          <TabLink key={item.href} {...item} active={isActive(location, item.href)} />
        ))}
        <Link
          href="/add"
          aria-label="Add transaction"
          className="flex flex-1 items-center justify-center py-1.5"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-fg">
            <PlusIcon />
          </span>
        </Link>
        {MOBILE_NAV.slice(2).map((item) => (
          <TabLink key={item.href} {...item} active={isActive(location, item.href)} />
        ))}
      </nav>

      <UpdatePrompt />
    </div>
  )
}

function TabLink({
  href,
  label,
  icon: NavIcon,
  active,
}: {
  href: string
  label: string
  icon: (typeof NAV)[number]['icon']
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={cx(
        'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium',
        active ? 'text-accent' : 'text-muted',
      )}
    >
      <NavIcon />
      {label}
    </Link>
  )
}

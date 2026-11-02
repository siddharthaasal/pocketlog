import type { ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import { HomeIcon, ListIcon, PlusIcon, SettingsIcon } from '../components/icons'
import { cx } from '../lib/cx'
import { UpdatePrompt } from './UpdatePrompt'

const NAV = [
  { href: '/', label: 'Home', icon: HomeIcon },
  { href: '/transactions', label: 'Transactions', icon: ListIcon },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
] as const

function isActive(location: string, href: string) {
  return href === '/' ? location === '/' : location.startsWith(href)
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation()

  return (
    <div className="md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 border-r border-border px-3 py-6 md:flex">
        <div className="mb-6 px-3 text-[17px] font-semibold tracking-tight">PocketLog</div>
        <Link
          href="/add"
          className="mb-4 flex h-10 items-center justify-center gap-2 rounded-xl bg-accent text-[15px] font-medium text-accent-fg hover:opacity-90"
        >
          <PlusIcon width={18} height={18} /> Add transaction
        </Link>
        {NAV.map(({ href, label, icon: NavIcon }) => (
          <Link
            key={href}
            href={href}
            className={cx(
              'flex h-10 items-center gap-3 rounded-lg px-3 text-[15px]',
              isActive(location, href)
                ? 'bg-surface-2 font-medium text-text'
                : 'text-muted hover:text-text',
            )}
          >
            <NavIcon width={18} height={18} /> {label}
          </Link>
        ))}
      </aside>

      <main className="mx-auto w-full max-w-3xl px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-8 md:pt-8 md:pb-12">
        {children}
      </main>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        {NAV.slice(0, 2).map((item) => (
          <TabLink key={item.href} {...item} active={isActive(location, item.href)} />
        ))}
        <Link
          href="/add"
          aria-label="Add transaction"
          className="flex flex-1 items-center justify-center py-1.5"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-fg">
            <PlusIcon />
          </span>
        </Link>
        {NAV.slice(2).map((item) => (
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

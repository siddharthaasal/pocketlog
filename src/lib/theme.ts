import { useSyncExternalStore } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
export const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

const KEY = 'pocketlog.theme'
const listeners = new Set<() => void>()

export function readThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* storage blocked: fall back to the system setting */
  }
  return 'system'
}

/** The colour of the browser bar behind the page, which a stylesheet can't change. */
const BAR = { light: '#f6f5f4', dark: '#191919' } as const

export function applyTheme(pref: ThemePreference): void {
  const root = document.documentElement
  if (pref === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
  const dark =
    pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove())
  const meta = document.createElement('meta')
  meta.name = 'theme-color'
  meta.content = dark ? BAR.dark : BAR.light
  document.head.appendChild(meta)
}

export function setThemePreference(pref: ThemePreference): void {
  try {
    if (pref === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    /* the choice still applies until the page is closed */
  }
  applyTheme(pref)
  listeners.forEach((l) => l())
}

/** Applies the saved choice, and keeps "System" in step when the device switches. */
export function startTheme(): void {
  applyTheme(readThemePreference())
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (readThemePreference() === 'system') applyTheme('system')
  })
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    readThemePreference,
    () => 'system' as const,
  )
}

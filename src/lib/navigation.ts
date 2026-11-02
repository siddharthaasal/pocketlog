/** Returns to the previous screen, or to `fallback` when the app was opened directly on this page. */
export function goBack(
  navigate: (to: string, options?: { replace?: boolean }) => void,
  fallback = '/',
) {
  if (window.history.length > 1) window.history.back()
  else navigate(fallback, { replace: true })
}

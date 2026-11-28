/**
 * A plain name for the kind of device, written into backup files so the one that merges a
 * file can say where it came from ("from your Mac"). Nothing more specific than the kind.
 */
export function deviceName(
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  touchPoints = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints,
): string {
  if (/iPhone/.test(userAgent)) return 'iPhone'
  if (/iPad/.test(userAgent)) return 'iPad'
  // iPadOS reports itself as a Mac; a Mac has no touch screen.
  if (/Macintosh/.test(userAgent)) return touchPoints > 1 ? 'iPad' : 'Mac'
  if (/Android/.test(userAgent)) return 'Android phone'
  if (/Windows/.test(userAgent)) return 'Windows PC'
  return 'another device'
}

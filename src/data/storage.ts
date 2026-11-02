/**
 * Asks the browser not to evict our IndexedDB under storage pressure.
 * Home Screen web apps on iOS are already exempt from Safari's 7-day cap,
 * but this guards against eviction when the device runs low on space.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}

export async function isStoragePersistent(): Promise<boolean | null> {
  if (!navigator.storage?.persisted) return null
  return navigator.storage.persisted()
}

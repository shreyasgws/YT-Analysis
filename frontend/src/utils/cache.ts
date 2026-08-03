interface CacheEntry<T> {
  data: T
  etag: string | null
  fetchedAt: number
}

const store = new Map<string, CacheEntry<unknown>>()
const DEFAULT_TTL_MS = 15 * 60 * 1000

export function cacheGet<T>(key: string, ttlMs = DEFAULT_TTL_MS): CacheEntry<T> | null {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() - entry.fetchedAt > ttlMs) {
    store.delete(key)
    return null
  }
  return entry as CacheEntry<T>
}

export function cacheSet<T>(key: string, data: T, etag: string | null = null): void {
  store.set(key, { data, etag, fetchedAt: Date.now() })
}

export function cacheTouch(key: string): void {
  const entry = store.get(key)
  if (entry) entry.fetchedAt = Date.now()
}

export function cacheDelete(key: string): void {
  store.delete(key)
}

export function cacheClear(): void {
  store.clear()
}

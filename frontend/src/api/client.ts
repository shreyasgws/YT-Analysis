import type { CaptionLanguage, TranscriptSegment, VideoMeta } from '../types'
import { cacheGet, cacheSet, cacheTouch } from '../utils/cache'
import { fetchMockLanguages, fetchMockTranscript, fetchMockVideoMeta } from './mockTranscript'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export interface FetchTranscriptResult {
  segments: TranscriptSegment[]
  fullText: string
}

interface CachedResponse<T> {
  data: T
  etag: string | null
}

async function fetchCached<T>(
  key: string,
  path: string,
  ttlMs: number,
): Promise<T> {
  const cached = cacheGet<CachedResponse<T>>(key, ttlMs)
  if (cached) {
    const headers = cached.etag ? { 'If-None-Match': cached.etag } : undefined
    const response = await fetch(path, { headers })
    if (response.status === 304) {
      cacheTouch(key)
      return cached.data.data
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error ?? `Request failed (${response.status})`)
    }
    const data = (await response.json()) as T
    cacheSet(key, { data, etag: response.headers.get('ETag') })
    return data
  }

  const response = await fetch(path)
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Request failed (${response.status})`)
  }
  const data = (await response.json()) as T
  cacheSet(key, { data, etag: response.headers.get('ETag') })
  return data
}

export async function fetchTranscript(
  videoId: string,
  lang?: string,
): Promise<FetchTranscriptResult> {
  if (USE_MOCK) {
    return fetchMockTranscript(videoId, lang)
  }
  const langKey = lang ? `:${lang}` : ''
  const query = lang ? `&lang=${encodeURIComponent(lang)}` : ''
  return fetchCached<FetchTranscriptResult>(
    `transcript:${videoId}${langKey}`,
    `/api/transcript?videoId=${encodeURIComponent(videoId)}${query}`,
    15 * 60 * 1000,
  )
}

export async function fetchVideoMeta(videoId: string): Promise<VideoMeta> {
  if (USE_MOCK) {
    return fetchMockVideoMeta(videoId)
  }
  return fetchCached<VideoMeta>(
    `meta:${videoId}`,
    `/api/video/meta?videoId=${encodeURIComponent(videoId)}`,
    24 * 60 * 60 * 1000,
  )
}

export async function fetchLanguages(videoId: string): Promise<CaptionLanguage[]> {
  if (USE_MOCK) {
    return fetchMockLanguages(videoId)
  }
  const result = await fetchCached<{ languages: CaptionLanguage[] }>(
    `languages:${videoId}`,
    `/api/video/languages?videoId=${encodeURIComponent(videoId)}`,
    24 * 60 * 60 * 1000,
  )
  return result.languages
}

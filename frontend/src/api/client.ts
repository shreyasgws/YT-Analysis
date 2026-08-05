import type { CaptionLanguage, TranscriptSegment, VideoMeta } from '../types'

export interface FetchTranscriptResult {
  segments: TranscriptSegment[]
  fullText: string
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Request failed (${response.status})`)
  }
  return (await response.json()) as T
}

export async function fetchTranscript(
  videoId: string,
  lang?: string,
): Promise<FetchTranscriptResult> {
  const query = lang ? `&lang=${encodeURIComponent(lang)}` : ''
  return fetchJson<FetchTranscriptResult>(
    `/api/transcript?videoId=${encodeURIComponent(videoId)}${query}`,
  )
}

export async function fetchVideoMeta(videoId: string): Promise<VideoMeta> {
  return fetchJson<VideoMeta>(`/api/video/meta?videoId=${encodeURIComponent(videoId)}`)
}

export async function fetchLanguages(videoId: string): Promise<CaptionLanguage[]> {
  const result = await fetchJson<{ languages: CaptionLanguage[] }>(
    `/api/video/languages?videoId=${encodeURIComponent(videoId)}`,
  )
  return result.languages
}

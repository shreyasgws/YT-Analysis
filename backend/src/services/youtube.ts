import { YoutubeTranscript, YoutubeTranscriptNotAvailableLanguageError } from 'youtube-transcript'
import type {
  CaptionLanguage,
  TranscriptResult,
  TranscriptSegment,
  VideoMeta,
} from '../types'
import { ApiError } from '../types'

const NOISE_PATTERN = /^\W+$|^\[.*\]$/
const WATCH_URL = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`

export function normalizeVideoId(input: string): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed

  const patterns = [
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
  ]

  for (const pattern of patterns) {
    const match = trimmed.match(pattern)
    if (match) return match[1]
  }
  return null
}

export function isValidLanguageCode(input: string): boolean {
  return /^[a-z]{2,3}([-_][a-z0-9]+)*$/i.test(input)
}

async function fetchWatchPage(videoId: string): Promise<string | null> {
  try {
    const response = await fetch(WATCH_URL(videoId), {
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  }
}

function extractJsonField(html: string, key: string): string | null {
  const match = html.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`))
  return match ? match[1] : null
}

interface RawCaptionTrack {
  languageCode?: unknown
  name?: { simpleText?: unknown }
  kind?: unknown
}

function parseCaptionTracks(html: string): CaptionLanguage[] {
  const match = html.match(/"captionTracks":(\[[\s\S]*?\])/)
  if (!match) return []

  let tracks: RawCaptionTrack[]
  try {
    tracks = JSON.parse(match[1]) as RawCaptionTrack[]
  } catch {
    return []
  }

  const byCode = new Map<string, CaptionLanguage>()
  for (const track of tracks) {
    if (typeof track.languageCode !== 'string' || !track.languageCode) continue
    const code = track.languageCode
    const kind = track.kind === 'asr' ? 'auto' : 'manual'
    const existing = byCode.get(code)
    if (existing && existing.kind === 'manual' && kind === 'auto') continue
    const name =
      typeof track.name?.simpleText === 'string' && track.name.simpleText
        ? track.name.simpleText
        : code
    byCode.set(code, { code, name, kind })
  }
  return [...byCode.values()]
}

export async function getLanguages(videoId: string): Promise<CaptionLanguage[]> {
  const html = await fetchWatchPage(videoId)
  if (!html) return []
  return parseCaptionTracks(html)
}

export async function getTranscript(videoId: string, lang?: string): Promise<TranscriptResult> {
  let segments: TranscriptSegment[]
  try {
    segments = await YoutubeTranscript.fetchTranscript(videoId, lang ? { lang } : undefined)
  } catch (err) {
    if (err instanceof YoutubeTranscriptNotAvailableLanguageError) {
      throw new ApiError(404, `Captions in "${lang}" are not available for this video.`)
    }
    if (err instanceof Error && /not available/i.test(err.message)) {
      throw new ApiError(404, 'No transcript available for this video.')
    }
    throw new ApiError(500, `Failed to fetch transcript: ${err instanceof Error ? err.message : 'unknown error'}`)
  }

  const cleanSegments: TranscriptSegment[] = segments
    .map((s) => ({ text: s.text.trim(), offset: s.offset, duration: s.duration }))
    .filter((s) => s.text.length > 0 && !NOISE_PATTERN.test(s.text))

  if (cleanSegments.length === 0) {
    throw new ApiError(404, 'No transcript available for this video.')
  }

  const fullText = cleanSegments.map((s) => s.text).join(' ')
  return { videoId, lang: lang ?? null, segments: cleanSegments, fullText }
}

interface OembedData {
  title?: string
  author_name?: string
  thumbnail_url?: string
}

async function fetchOembed(videoId: string): Promise<OembedData> {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    WATCH_URL(videoId),
  )}&format=json`

  let response: Response
  try {
    response = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    throw new ApiError(500, 'Failed to reach YouTube oembed service.')
  }

  if (!response.ok) {
    throw new ApiError(404, 'Video not found.')
  }
  return (await response.json()) as OembedData
}

export async function getVideoMeta(videoId: string): Promise<VideoMeta> {
  const oembed = await fetchOembed(videoId)
  const html = await fetchWatchPage(videoId)

  const meta: VideoMeta = {
    videoId,
    title: oembed.title ?? 'Untitled video',
    author: oembed.author_name ?? 'Unknown channel',
    thumbnail: oembed.thumbnail_url ?? '',
  }

  if (html) {
    const lengthSeconds = extractJsonField(html, 'lengthSeconds')
    const parsed = lengthSeconds ? Number(lengthSeconds) : NaN
    if (Number.isFinite(parsed) && parsed > 0) {
      meta.durationSeconds = parsed
    }
    const uploadDate = extractJsonField(html, 'uploadDate')
    if (uploadDate) {
      meta.uploadDate = uploadDate
    }
  }

  return meta
}

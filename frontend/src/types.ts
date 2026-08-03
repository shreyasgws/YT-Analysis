export interface TranscriptSegment {
  text: string
  /** Offset in milliseconds. */
  offset: number
  /** Duration in milliseconds. */
  duration: number
}

export type TranscriptSource = 'manual' | 'auto' | 'whisper' | 'unknown'

export interface CaptionLanguage {
  code: string
  name: string
  kind: TranscriptSource
}

export interface Transcript {
  videoId: string
  lang: string | null
  segments: TranscriptSegment[]
  fullText: string
}

export interface VideoMeta {
  videoId: string
  title: string
  author: string
  thumbnail: string
  durationSeconds?: number
  uploadDate?: string
}

export interface Paragraph {
  startMs: number
  endMs: number
  text: string
}

export type ExportFormat = 'txt' | 'md' | 'json' | 'srt' | 'vtt'

export type FetchState = 'idle' | 'loading' | 'success' | 'error'

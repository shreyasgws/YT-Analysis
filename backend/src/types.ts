export interface TranscriptSegment {
  text: string
  offset: number
  duration: number
}

export type TranscriptSource = 'manual' | 'auto' | 'unknown'

export interface VideoMeta {
  videoId: string
  title: string
  author: string
  thumbnail: string
  durationSeconds?: number
  uploadDate?: string
}

export interface CaptionLanguage {
  code: string
  name: string
  kind: TranscriptSource
}

export interface TranscriptResult {
  videoId: string
  lang: string | null
  segments: TranscriptSegment[]
  fullText: string
}

export interface Paragraph {
  startMs: number
  endMs: number
  text: string
}

export interface SummarizePayload {
  videoId: string
  title: string
  lang: string | null
  paragraphs: Paragraph[]
}

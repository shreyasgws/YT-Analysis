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

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function sendError(res: import('express').Response, err: unknown): void {
  const status = err instanceof ApiError ? err.status : 500
  const message = err instanceof ApiError ? err.message : 'Internal server error.'
  res.status(status).json({ error: message })
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

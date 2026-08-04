import type { Paragraph } from '../types'

export interface SummarizePayload {
  videoId: string
  title: string
  lang: string | null
  paragraphs: Paragraph[]
}

export interface ProgressResponse {
  done: number
  total: number
  phase: string
  markdown?: string
  cached?: boolean
  error?: string
}

export interface PollResult extends ProgressResponse {
  /** True when the backend 404s the job (server restarted or TTL expired). */
  lost?: boolean
}

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null
  return body?.error ?? `Request failed (${response.status})`
}

export async function startSummarize(payload: SummarizePayload): Promise<{ jobId: string }> {
  const response = await fetch('/api/analysis/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(await parseError(response))
  }
  return (await response.json()) as { jobId: string }
}

export async function pollProgress(jobId: string): Promise<PollResult> {
  const response = await fetch(`/api/analysis/progress/${encodeURIComponent(jobId)}`)
  if (response.status === 404) {
    return { done: 0, total: 0, phase: 'lost', lost: true }
  }
  if (!response.ok) {
    throw new Error(await parseError(response))
  }
  return (await response.json()) as ProgressResponse
}

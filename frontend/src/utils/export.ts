import type { ExportFormat, Paragraph, TranscriptSegment, TranscriptSource } from '../types'
import { formatSeconds } from './youtube'

export interface ExportContext {
  videoId: string
  title: string
  author: string
  source: TranscriptSource
  lang: string | null
  segments: TranscriptSegment[]
  paragraphs: Paragraph[]
  videoUrl: string
}

export interface ExportFormatInfo {
  label: string
  extension: string
  mime: string
}

export const exportFormats: Record<ExportFormat, ExportFormatInfo> = {
  txt: { label: 'Plain text', extension: 'txt', mime: 'text/plain' },
  md: { label: 'Markdown', extension: 'md', mime: 'text/markdown' },
  json: { label: 'JSON', extension: 'json', mime: 'application/json' },
  srt: { label: 'SubRip (.srt)', extension: 'srt', mime: 'text/plain' },
  vtt: { label: 'WebVTT (.vtt)', extension: 'vtt', mime: 'text/vtt' },
}

function toSubtitleTimestamp(ms: number, sep: string): string {
  const totalMs = Math.max(0, Math.floor(ms))
  const hours = Math.floor(totalMs / 3_600_000)
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000)
  const seconds = Math.floor((totalMs % 60_000) / 1000)
  const millis = totalMs % 1000
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${sep}${pad(millis, 3)}`
}

const txtFormatter = (ctx: ExportContext): string =>
  ctx.paragraphs.map((p) => `[${formatSeconds(p.startMs / 1000)}] ${p.text}`).join('\n\n')

const markdownFormatter = (ctx: ExportContext): string =>
  [
    `# ${ctx.title}`,
    '',
    `By ${ctx.author}`,
    '',
    ...ctx.paragraphs.map((p) => `**[${formatSeconds(p.startMs / 1000)}]** ${p.text}`),
    '',
  ].join('\n')

const jsonFormatter = (ctx: ExportContext): string =>
  JSON.stringify(
    {
      videoId: ctx.videoId,
      title: ctx.title,
      author: ctx.author,
      lang: ctx.lang,
      source: ctx.source,
      segments: ctx.segments,
    },
    null,
    2,
  )

const srtFormatter = (ctx: ExportContext): string =>
  ctx.segments
    .map((s, i) => {
      const start = toSubtitleTimestamp(s.offset, ',')
      const end = toSubtitleTimestamp(s.offset + s.duration, ',')
      return `${i + 1}\n${start} --> ${end}\n${s.text}`
    })
    .join('\n\n')

const vttFormatter = (ctx: ExportContext): string =>
  [
    'WEBVTT',
    '',
    ...ctx.segments.map((s, i) => {
      const start = toSubtitleTimestamp(s.offset, '.')
      const end = toSubtitleTimestamp(s.offset + s.duration, '.')
      return `${i + 1}\n${start} --> ${end}\n${s.text}`
    }),
    '',
  ].join('\n')

export const exportFormatters: Record<ExportFormat, (ctx: ExportContext) => string> = {
  txt: txtFormatter,
  md: markdownFormatter,
  json: jsonFormatter,
  srt: srtFormatter,
  vtt: vttFormatter,
}

function sanitizeFilename(input: string): string {
  const cleaned = input
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80)
  return cleaned || 'transcript'
}

export function buildFilename(videoId: string, title: string): string {
  const clean = sanitizeFilename(title)
  return clean ? `${clean}_[${videoId}]` : videoId
}

const INVALID_FILENAME_CHAR = /[<>:"/\\|?*]/

export function sanitizeTitleFilename(input: string, fallback = 'summary'): string {
  let filtered = ''
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch.charCodeAt(0) < 32) continue
    if (INVALID_FILENAME_CHAR.test(ch)) continue
    filtered += ch
  }
  const cleaned = filtered
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/g, '')
  return cleaned || fallback
}

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function exportTranscript(format: ExportFormat, ctx: ExportContext) {
  const info = exportFormats[format]
  downloadFile(`${buildFilename(ctx.videoId, ctx.title)}.${info.extension}`, exportFormatters[format](ctx), info.mime)
}

export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

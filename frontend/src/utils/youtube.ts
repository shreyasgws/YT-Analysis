export function extractVideoId(url: string): string | null {
  if (!url) return null
  if (url.length === 11 && /^[A-Za-z0-9_-]{11}$/.test(url)) return url

  const patterns = [
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

export function isValidYoutubeUrl(url: string): boolean {
  return extractVideoId(url) !== null
}

export function msToSeconds(ms: number): number {
  return Math.max(0, Math.floor(ms / 1000))
}

export function formatMs(ms: number): string {
  return formatSeconds(msToSeconds(ms))
}

export function formatSeconds(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60

  const mm = String(minutes).padStart(2, '0')
  const ss = String(secs).padStart(2, '0')

  if (hours > 0) {
    const hh = String(hours).padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  }
  return `${mm}:${ss}`
}

export function formatDate(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return isoDate
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function estimateWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function estimatedReadMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 200))
}

import type { TranscriptSource } from '../types'

const KIND_LABELS: Record<TranscriptSource, string> = {
  manual: 'Manual',
  auto: 'Auto-generated',
  whisper: 'Whisper',
  unknown: 'Unknown',
}

export function captionKindLabel(kind: TranscriptSource): string {
  return KIND_LABELS[kind]
}

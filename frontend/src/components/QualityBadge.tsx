import type { TranscriptSource } from '../types'

const SOURCE_CONFIG: Record<
  TranscriptSource,
  { label: string; tone: string; description: string }
> = {
  manual: {
    label: 'Manual captions',
    tone: 'good',
    description: 'Captions uploaded by the creator.',
  },
  auto: {
    label: 'Auto-generated',
    tone: 'warn',
    description: 'Captions generated automatically by YouTube.',
  },
  unknown: {
    label: 'Unknown source',
    tone: 'muted',
    description: 'The caption source could not be determined.',
  },
}

interface QualityBadgeProps {
  source: TranscriptSource
}

export function QualityBadge({ source }: QualityBadgeProps) {
  const config = SOURCE_CONFIG[source]
  return (
    <span className={`badge badge-${config.tone}`} title={config.description}>
      {config.label}
    </span>
  )
}

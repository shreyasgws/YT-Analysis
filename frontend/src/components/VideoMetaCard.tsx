import type { ReactNode } from 'react'
import type { VideoMeta } from '../types'
import { formatDate, formatSeconds } from '../utils/youtube'
import { QualityBadge } from './QualityBadge'
import type { TranscriptSource } from '../types'

interface VideoMetaCardProps {
  meta: VideoMeta
  source: TranscriptSource
  videoUrl: string
  languageControl?: ReactNode
}

export function VideoMetaCard({ meta, source, videoUrl, languageControl }: VideoMetaCardProps) {
  const metaRows: { label: string; value: string }[] = []
  if (meta.durationSeconds) {
    metaRows.push({ label: 'Duration', value: formatSeconds(meta.durationSeconds) })
  }
  if (meta.uploadDate) {
    metaRows.push({ label: 'Published', value: formatDate(meta.uploadDate) })
  }

  return (
    <div className="video-card">
      {meta.thumbnail && (
        <img className="video-thumb" src={meta.thumbnail} alt="" loading="lazy" />
      )}
      <div className="video-info">
        <h2 className="video-title">{meta.title}</h2>
        <p className="video-author">{meta.author}</p>
        <div className="meta-rows">
          {metaRows.map((row) => (
            <span className="meta-chip" key={row.label}>
              {row.label}: <strong>{row.value}</strong>
            </span>
          ))}
        </div>
        <div className="language-row">
          {languageControl}
          <QualityBadge source={source} />
        </div>
        <p className="video-link">
          <a href={videoUrl} target="_blank" rel="noreferrer">
            youtube.com/watch?v={meta.videoId}
          </a>
        </p>
      </div>
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Paragraph } from '../types'
import { formatSeconds, msToSeconds } from '../utils/youtube'
import { HighlightText } from './HighlightText'

interface VirtualTranscriptBodyProps {
  paragraphs: Paragraph[]
  originalIndices: number[]
  showTimestamps: boolean
  query: string
  activeIndex: number | null
  jumpRequest?: { index: number; nonce: number } | null
  videoUrl: string
  isLoadingLanguage: boolean
  loadingLabel: string
  emptyMessage: string | null
}

export function VirtualTranscriptBody({
  paragraphs,
  originalIndices,
  showTimestamps,
  query,
  activeIndex,
  jumpRequest,
  videoUrl,
  isLoadingLanguage,
  loadingLabel,
  emptyMessage,
}: VirtualTranscriptBodyProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: paragraphs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 60,
    overscan: 8,
    getItemKey: (index) => originalIndices[index],
  })

  useEffect(() => {
    virtualizer.scrollToOffset(0)
  }, [paragraphs])

  useEffect(() => {
    if (activeIndex !== null && paragraphs.length > 0) {
      virtualizer.scrollToIndex(activeIndex, { align: 'center' })
    }
  }, [activeIndex, paragraphs.length, virtualizer])

  const lastNonce = useRef<number | null>(null)

  useEffect(() => {
    if (jumpRequest && jumpRequest.nonce !== lastNonce.current) {
      lastNonce.current = jumpRequest.nonce
      virtualizer.scrollToIndex(jumpRequest.index, { align: 'center' })
    }
  }, [jumpRequest, virtualizer])

  const rows = virtualizer.getVirtualItems()

  return (
    <div className="virtual-body">
      {isLoadingLanguage && (
        <div className="body-loading" role="status" aria-live="polite">
          <span className="body-loading-spinner" aria-hidden="true" />
          Loading {loadingLabel} captions…
        </div>
      )}

      <div className="transcript-body" ref={scrollRef}>
        {emptyMessage ? (
          <p className="no-results">{emptyMessage}</p>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {rows.map((row) => {
              const paragraph = paragraphs[row.index]
              const jumpActive = jumpRequest ? row.index === jumpRequest.index : false
              const isActive = (activeIndex !== null && row.index === activeIndex) || jumpActive
              return (
                <div
                  className="vr-row"
                  data-index={row.index}
                  ref={virtualizer.measureElement}
                  key={row.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${row.start}px)`,
                  }}
                >
                  <div className={`paragraph${isActive ? ' active' : ''}`}>
                    {showTimestamps && (
                      <a
                        className="timestamp"
                        href={`${videoUrl}&t=${msToSeconds(paragraph.startMs)}s`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {formatSeconds(paragraph.startMs / 1000)}
                      </a>
                    )}
                    <p>
                      <HighlightText text={paragraph.text} query={query} />
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

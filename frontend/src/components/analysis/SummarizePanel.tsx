import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Markdown, { type Components } from 'react-markdown'
import type { Paragraph } from '../../types'
import { useSummarize } from '../../hooks/useSummarize'
import { copyToClipboard, downloadFile, sanitizeTitleFilename } from '../../utils/export'
import { useToast } from '../../context/ToastContext'
import { PanelToggle } from '../PanelToggle'
import { CheckIcon, CopyIcon, DownloadIcon, SpinnerIcon } from '../icons'

interface SummarizePanelProps {
  videoId: string
  title: string
  lang: string | null
  paragraphs: Paragraph[]
  onJumpToTimestamp: (ms: number) => void
}

function flattenText(nodes: ReactNode): string {
  const out: string[] = []
  const walk = (node: ReactNode) => {
    if (typeof node === 'string' || typeof node === 'number') {
      out.push(String(node))
    } else if (Array.isArray(node)) {
      node.forEach(walk)
    } else if (node && typeof node === 'object' && 'props' in node) {
      const props = (node as { props?: { children?: ReactNode } }).props
      if (props?.children) walk(props.children)
    }
  }
  walk(nodes)
  return out.join('')
}

function timestampToMs(stamp: string): number {
  const parts = stamp.replace(/[[\]]/g, '').split(':').map(Number)
  let totalSeconds = 0
  for (const part of parts) totalSeconds = totalSeconds * 60 + part
  return totalSeconds * 1000
}

function phaseLabel(phase: string, done: number, total: number): string {
  switch (phase) {
    case 'queued':
      return 'Queued…'
    case 'chunking':
      return 'Chunking…'
    case 'summarizing':
      return `Summarizing ${done} / ${total}`
    case 'reducing':
      return 'Reducing…'
    case 'assembling':
      return 'Assembling…'
    case 'done':
      return 'Done'
    default:
      return phase
  }
}

const STAGES: { key: string; label: string }[] = [
  { key: 'queued', label: 'Queued' },
  { key: 'chunking', label: 'Chunking transcript' },
  { key: 'summarizing', label: 'Summarizing chunks' },
  { key: 'reducing', label: 'Reducing sections' },
  { key: 'assembling', label: 'Assembling notes' },
]

function stageStatus(stageKey: string, phase: string): 'done' | 'active' | 'pending' {
  if (phase === 'done') return 'done'
  const stageIdx = STAGES.findIndex((s) => s.key === stageKey)
  const currentIdx = STAGES.findIndex((s) => s.key === phase)
  if (currentIdx === -1) return stageIdx === 0 ? 'active' : 'pending'
  if (stageIdx < currentIdx) return 'done'
  if (stageIdx === currentIdx) return 'active'
  return 'pending'
}

function percentFor(phase: string, done: number, total: number): number {
  if (phase === 'done') return 100
  const idx = STAGES.findIndex((s) => s.key === phase)
  if (idx === -1) return 0
  const base = idx / STAGES.length
  const frac = total > 0 ? Math.min(done / total, 1) : 0
  return Math.round((base + (1 / STAGES.length) * frac) * 100)
}

export function SummarizePanel({
  videoId,
  title,
  lang,
  paragraphs,
  onJumpToTimestamp,
}: SummarizePanelProps) {
  const notify = useToast()
  const { state, markdown, progress, error, cached, start } = useSummarize(videoId, lang)
  const [open, setOpen] = useState(false)
  const headerRef = useRef<HTMLDivElement>(null)

  // Hold the completed progress panel (100%, all stages checked) briefly
  // before swapping to the rendered summary — the "I'm done" beat.
  const [showDone, setShowDone] = useState(false)

  useEffect(() => {
    if (state !== 'done') return
    setShowDone(true)
    const timer = setTimeout(() => setShowDone(false), 500)
    return () => clearTimeout(timer)
  }, [state])

  // Auto-expand exactly once per completed summary and bring it into view.
  useEffect(() => {
    if (state !== 'done') return
    setOpen((current) => current || true)
    const header = headerRef.current
    if (!header) return
    const rect = header.getBoundingClientRect()
    if (rect.top >= 0 && rect.bottom <= window.innerHeight) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    header.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' })
  }, [state])

  const running = state === 'running'
  const actionLabel = state === 'done' ? 'Regenerate' : state === 'error' ? 'Try again' : 'Summarize'

  const components: Components = useMemo(
    () => ({
      h2: (props) => {
        const { children } = props
        const text = flattenText(children)
        const match = text.match(/^\[(\d+:)?\d{2}:\d{2}\]/)
        if (match) {
          const stamp = match[0]
          const rest = text.slice(stamp.length).trim()
          return (
            <h2>
              <button
                type="button"
                className="summary-ts-btn"
                onClick={() => onJumpToTimestamp(timestampToMs(stamp))}
                title="Jump to this point in the transcript"
              >
                {stamp}
              </button>
              {rest ? ` ${rest}` : ''}
            </h2>
          )
        }
        return <h2>{children}</h2>
      },
    }),
    [onJumpToTimestamp],
  )

  function handleAction() {
    if (running || paragraphs.length === 0) return
    start({ videoId, title, lang, paragraphs })
  }

  async function handleCopy() {
    if (!markdown) return
    try {
      await copyToClipboard(markdown)
      notify('Summary copied')
    } catch {
      notify('Copy failed. Please try again.', 'error')
    }
  }

  function handleDownload() {
    if (!markdown) return
    downloadFile(`${sanitizeTitleFilename(title)}.md`, markdown, 'text/markdown')
    notify('Summary downloaded')
  }

  return (
    <section className="summary-panel">
      <div className="summary-header" ref={headerRef}>
        <PanelToggle
          open={open}
          onToggle={() => setOpen((current) => !current)}
          label="AI Summary"
          controlsId="summary-body"
        />

        {running && progress ? (
          <span className="summary-progress" role="status" aria-live="polite">
            <SpinnerIcon />
            {phaseLabel(progress.phase, progress.done, progress.total)}
          </span>
        ) : (
          <div className="summary-actions">
            <button
              type="button"
              className="ghost-btn summary-action-btn"
              onClick={handleAction}
              disabled={running || paragraphs.length === 0}
            >
              {actionLabel}
            </button>
            {markdown && (
              <>
                <button type="button" className="ghost-btn summary-action-btn" onClick={handleCopy}>
                  <CopyIcon />
                  Copy
                </button>
                <button
                  type="button"
                  className="ghost-btn summary-action-btn"
                  onClick={handleDownload}
                >
                  <DownloadIcon />
                  Download
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {open && (
        <div className="summary-body" id="summary-body">
          {(running || showDone) && progress && (
            <div className="analysis-progress" role="status" aria-live="polite">
              <div className="analysis-progress-top">
                <span>Analyzing video</span>
                <span className="analysis-progress-pct">
                  {percentFor(progress.phase, progress.done, progress.total)}%
                </span>
              </div>
              <div className="analysis-bar" aria-hidden="true">
                <div
                  className="analysis-bar-fill"
                  style={{ width: `${percentFor(progress.phase, progress.done, progress.total)}%` }}
                />
              </div>
              <ol className="analysis-stages">
                {STAGES.map((stage) => {
                  const status = stageStatus(stage.key, progress.phase)
                  const detail =
                    stage.key === 'summarizing' && progress.total > 0
                      ? `${progress.done} / ${progress.total}`
                      : ''
                  return (
                    <li key={stage.key} className={`analysis-stage ${status}`}>
                      <span className="stage-icon">
                        {status === 'done' ? (
                          <CheckIcon size={16} />
                        ) : status === 'active' ? (
                          <SpinnerIcon size={16} />
                        ) : (
                          <span className="stage-dot" />
                        )}
                      </span>
                      <span className="stage-label">{stage.label}</span>
                      {detail && <span className="stage-detail">{detail}</span>}
                    </li>
                  )
                })}
              </ol>
            </div>
          )}

          {error && (
            <div className="error" role="alert">
              <p>{error}</p>
            </div>
          )}

          {state === 'done' && markdown && !showDone && (
            <>
              {cached && <p className="summary-cached">Loaded from cache — no regeneration needed.</p>}
              <div className="summary-markdown">
                <Markdown components={components}>{markdown}</Markdown>
              </div>
            </>
          )}

          {state === 'idle' && !running && (
            <p className="summary-empty">
              Generate concise, timestamped study notes for this transcript with a local AI model.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

import { useMemo, useState, type ReactNode } from 'react'
import Markdown, { type Components } from 'react-markdown'
import type { Paragraph } from '../../types'
import { useSummarize } from '../../hooks/useSummarize'
import { copyToClipboard, downloadFile, sanitizeTitleFilename } from '../../utils/export'
import { useToast } from '../../context/ToastContext'
import { PanelToggle } from '../PanelToggle'
import { CopyIcon, DownloadIcon, SpinnerIcon } from '../icons'

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
      <div className="summary-header">
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
          {running && progress && (
            <div className="body-loading" role="status" aria-live="polite">
              <span className="body-loading-spinner" aria-hidden="true" />
              {phaseLabel(progress.phase, progress.done, progress.total)}
            </div>
          )}

          {error && (
            <div className="error" role="alert">
              <p>{error}</p>
            </div>
          )}

          {state === 'done' && markdown && (
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

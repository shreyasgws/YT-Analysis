import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CaptionLanguage, ExportFormat, Paragraph, TranscriptSource, TranscriptSegment, VideoMeta } from '../types'
import { estimateWordCount, estimatedReadMinutes, formatMs, formatSeconds } from '../utils/youtube'
import { groupSegments } from '../utils/group'
import { copyToClipboard, exportFormats, exportTranscript } from '../utils/export'
import { useToast } from '../context/ToastContext'
import { VideoMetaCard } from './VideoMetaCard'
import { SearchBar } from './SearchBar'
import { DropdownMenu } from './DropdownMenu'
import { LanguageSelector } from './LanguageSelector'
import { VirtualTranscriptBody } from './VirtualTranscriptBody'
import { SummarizePanel } from './analysis/SummarizePanel'
import { PanelToggle } from './PanelToggle'
import { CopyIcon, DownloadIcon, ResetIcon, XIcon } from './icons'
import type { SelectLanguageResult } from '../hooks/useTranscript'

interface TranscriptViewProps {
  videoId: string
  meta: VideoMeta
  source: TranscriptSource
  segments: TranscriptSegment[]
  fullText: string
  languages: CaptionLanguage[]
  selectedLang: string | null
  isLoadingLanguage: boolean
  onSelectLanguage: (code: string) => Promise<SelectLanguageResult>
  onReset: () => void
}

export function TranscriptView({
  videoId,
  meta,
  source,
  segments,
  fullText,
  languages,
  selectedLang,
  isLoadingLanguage,
  onSelectLanguage,
  onReset,
}: TranscriptViewProps) {
  const notify = useToast()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [showTimestamps, setShowTimestamps] = useState(false)
  const [noticeDismissed, setNoticeDismissed] = useState(false)
  const [scrollNonce, setScrollNonce] = useState(0)
  const [transcriptOpen, setTranscriptOpen] = useState(true)
  const searchRef = useRef<HTMLInputElement>(null)

  const paragraphs = useMemo(() => groupSegments(segments), [segments])
  const normalizedQuery = query.trim().toLowerCase()

  const matchingIndices = useMemo(() => {
    if (!normalizedQuery) return []
    return paragraphs.reduce<number[]>((acc, paragraph, index) => {
      if (paragraph.text.toLowerCase().includes(normalizedQuery)) acc.push(index)
      return acc
    }, [])
  }, [paragraphs, normalizedQuery])

  const matchCount = matchingIndices.length

  useEffect(() => {
    setActiveIndex(0)
  }, [normalizedQuery])

  useEffect(() => {
    function handleGlobalKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      const isTyping = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
      if (event.key === '/' && !isTyping && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleGlobalKey)
    return () => document.removeEventListener('keydown', handleGlobalKey)
  }, [])

  const goToMatch = useCallback(
    (delta: number) => {
      if (matchCount === 0) return
      setActiveIndex((current) => (current + delta + matchCount) % matchCount)
    },
    [matchCount],
  )

  const jumpToTimestamp = useCallback(
    (ms: number) => {
      let index = 0
      for (let i = 0; i < paragraphs.length; i++) {
        if (paragraphs[i].startMs <= ms) index = i
        else break
      }
      setActiveIndex(index)
      setScrollNonce((current) => current + 1)
    },
    [paragraphs],
  )

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      goToMatch(event.shiftKey ? -1 : 1)
    } else if (event.key === 'Escape') {
      setQuery('')
      searchRef.current?.blur()
    }
  }

  const visibleParagraphs: Paragraph[] = normalizedQuery
    ? matchingIndices.map((i) => paragraphs[i])
    : paragraphs

  const originalIndices: number[] = normalizedQuery ? matchingIndices : paragraphs.map((_, i) => i)

  const paragraphsWithTimestamps = useMemo(
    () => paragraphs.map((p) => `[${formatSeconds(p.startMs / 1000)}] ${p.text}`).join('\n\n'),
    [paragraphs],
  )
  const paragraphsPlain = useMemo(
    () => paragraphs.map((p) => p.text).join('\n\n'),
    [paragraphs],
  )

  async function handleCopy(text: string, message: string) {
    try {
      await copyToClipboard(text)
      notify(message)
    } catch {
      notify('Copy failed. Please try again.', 'error')
    }
  }

  async function handleCopySelection() {
    const selection = window.getSelection()?.toString().trim()
    if (!selection) {
      notify('Select some text in the transcript first.', 'error')
      return
    }
    await handleCopy(selection, 'Selection copied')
  }

  function handleExport(format: ExportFormat) {
    exportTranscript(format, {
      videoId,
      title: meta.title,
      author: meta.author,
      source,
      lang: selectedLang,
      segments,
      paragraphs,
      videoUrl,
    })
    notify(`Exported as ${exportFormats[format].label}`)
  }

  async function handleSelectLanguage(code: string) {
    const result = await onSelectLanguage(code)
    if (!result.ok && result.message) {
      notify(result.message, 'error')
    }
  }

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`

  const selectedLanguage = languages.find((language) => language.code === selectedLang)
  const englishUnavailable =
    languages.length > 0 && !languages.some((language) => language.code === 'en')
  const showEnglishNotice = englishUnavailable && !noticeDismissed

  const stats = useMemo(() => {
    const words = estimateWordCount(fullText)
    const last = segments[segments.length - 1]
    const duration = last ? last.offset + last.duration : 0
    return {
      words,
      minutes: estimatedReadMinutes(words),
      paragraphs: paragraphs.length,
      duration: formatMs(duration),
    }
  }, [fullText, segments, paragraphs])

  return (
    <section className="transcript">
      <VideoMetaCard
        meta={meta}
        source={source}
        videoUrl={videoUrl}
        languageControl={
          <LanguageSelector
            languages={languages}
            selectedLang={selectedLang}
            disabled={isLoadingLanguage}
            onSelect={handleSelectLanguage}
          />
        }
      />

      <div className="toolbar">
        <SearchBar
          ref={searchRef}
          query={query}
          onQueryChange={setQuery}
          matchCount={matchCount}
          activeIndex={activeIndex}
          onPrev={() => goToMatch(-1)}
          onNext={() => goToMatch(1)}
          onClear={() => setQuery('')}
          onKeyDown={handleSearchKeyDown}
        />
        <div className="toolbar-spacer" />
        <label className="toggle">
          <input
            type="checkbox"
            checked={showTimestamps}
            onChange={(e) => setShowTimestamps(e.target.checked)}
          />
          Show timestamps
        </label>
        <DropdownMenu
          label="Copy"
          icon={<CopyIcon />}
          items={[
            { label: 'With timestamps', onSelect: () => handleCopy(paragraphsWithTimestamps, 'Copied with timestamps') },
            { label: 'Without timestamps', onSelect: () => handleCopy(paragraphsPlain, 'Transcript copied') },
            { label: 'Selected text', hint: '⌘/Ctrl+C', onSelect: handleCopySelection },
          ]}
        />
        <DropdownMenu
          label="Download"
          icon={<DownloadIcon />}
          items={(Object.keys(exportFormats) as ExportFormat[]).map((format) => ({
            label: exportFormats[format].label,
            hint: `.${exportFormats[format].extension}`,
            onSelect: () => handleExport(format),
          }))}
        />
        <button type="button" className="ghost-btn" onClick={onReset}>
          <ResetIcon />
          New video
        </button>
      </div>

      <div className="stats">
        <span>
          <strong>{stats.words.toLocaleString()}</strong> words
        </span>
        <span>
          ~<strong>{stats.minutes}</strong> min read
        </span>
        <span>
          <strong>{stats.paragraphs}</strong> paragraphs
        </span>
        <span>
          <strong>{stats.duration}</strong> duration
        </span>
      </div>

      {showEnglishNotice && (
        <div className="notice" role="status">
          <span>
            English captions are unavailable. Showing{' '}
            <strong>{selectedLanguage?.name ?? 'another'} captions</strong> instead.
          </span>
          <button
            type="button"
            className="notice-close"
            onClick={() => setNoticeDismissed(true)}
            aria-label="Dismiss notice"
          >
            <XIcon size={14} />
          </button>
        </div>
      )}

      <SummarizePanel
        key={`${videoId}:${selectedLang ?? 'none'}`}
        videoId={videoId}
        title={meta.title}
        lang={selectedLang}
        paragraphs={paragraphs}
        onJumpToTimestamp={jumpToTimestamp}
      />

      <section className="transcript-panel">
        <div className="transcript-header">
          <PanelToggle
            open={transcriptOpen}
            onToggle={() => setTranscriptOpen((current) => !current)}
            label="Transcript"
            controlsId="transcript-body"
          />
          <span className="transcript-header-stats">
            {stats.paragraphs} paragraphs
          </span>
        </div>
        <div
          className={`transcript-collapse${transcriptOpen ? '' : ' collapsed'}`}
          id="transcript-body"
        >
          <VirtualTranscriptBody
            key={selectedLang ?? 'none'}
            paragraphs={visibleParagraphs}
            originalIndices={originalIndices}
            showTimestamps={showTimestamps}
            query={query}
            activeIndex={normalizedQuery ? activeIndex : null}
            jumpRequest={
              normalizedQuery || scrollNonce > 0 ? { index: activeIndex, nonce: scrollNonce } : null
            }
            videoUrl={videoUrl}
            isLoadingLanguage={isLoadingLanguage}
            loadingLabel={selectedLanguage?.name ?? ''}
            emptyMessage={normalizedQuery && matchCount === 0 ? `No matches for “${query.trim()}”. Try a different search.` : null}
          />
        </div>
      </section>
    </section>
  )
}

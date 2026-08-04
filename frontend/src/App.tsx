import { useEffect, useState } from 'react'
import { useTranscript } from './hooks/useTranscript'
import { UrlInput } from './components/UrlInput'
import { TranscriptView } from './components/TranscriptView'
import { Skeleton } from './components/Skeleton'
import { CheckIcon, YoutubeIcon } from './components/icons'

const FEATURES = [
  'Local AI',
  'Markdown Export',
  'Timestamp Navigation',
  'Offline Friendly',
]

const QUICK_STEPS = [
  ['Paste a YouTube URL', 'Any video link or ID works.'],
  ['Fetch transcript', 'Auto-detected subtitles in any language.'],
  ['Generate AI summary', 'Local study notes with timestamps in 15–40s.'],
]

function App() {
  const {
    state,
    videoId,
    segments,
    fullText,
    source,
    meta,
    languages,
    selectedLang,
    isLoadingLanguage,
    error,
    load,
    selectLanguage,
    reset,
  } = useTranscript()

  // Feature chips only matter before analysis: fade out once a transcript
  // loads, then drop them from layout; they remount (and fade back in) on reset.
  const [chipsGone, setChipsGone] = useState(false)

  useEffect(() => {
    if (state === 'success') {
      const timer = setTimeout(() => setChipsGone(true), 220)
      return () => clearTimeout(timer)
    }
    setChipsGone(false)
  }, [state])

  return (
    <main className="app">
      <a className="skip-link" href="#content">
        Skip to content
      </a>

      <header className="app-header">
        <h1 className="reveal">
          <YoutubeIcon size={26} />
          <span>
            YouTube Analysis <span className="accent">Pipeline</span>
          </span>
        </h1>
        <p className="tagline reveal" style={{ animationDelay: '80ms' }}>
          Analyze, summarize, and study any YouTube video — entirely on your machine.
        </p>
      </header>

      <div className="hero-actions reveal" style={{ animationDelay: '160ms' }}>
        <UrlInput onSubmit={load} disabled={state === 'loading'} />

        {!chipsGone && (
          <div className={`feature-chips${state === 'success' ? ' is-fading' : ''}`}>
            {FEATURES.map((feature) => (
              <span className="chip" key={feature}>
                <CheckIcon size={12} />
                {feature}
              </span>
            ))}
          </div>
        )}
      </div>

      <div id="content">
        {state === 'loading' && <Skeleton />}

        {state === 'error' && (
          <div className="error" role="alert">
            <p>{error}</p>
            <button type="button" className="ghost-btn" onClick={reset}>
              Try again
            </button>
          </div>
        )}

        {state === 'success' && videoId && meta && (
          <TranscriptView
            videoId={videoId}
            meta={meta}
            source={source}
            segments={segments}
            fullText={fullText}
            languages={languages}
            selectedLang={selectedLang}
            isLoadingLanguage={isLoadingLanguage}
            onSelectLanguage={selectLanguage}
            onReset={reset}
          />
        )}

        {state === 'idle' && (
          <div className="quick-start reveal">
            <ol className="quick-steps">
              {QUICK_STEPS.map(([title, hint]) => (
                <li key={title}>
                  <span className="quick-step-num" aria-hidden="true">
                    {QUICK_STEPS.findIndex(([t]) => t === title) + 1}
                  </span>
                  <div className="quick-step-text">
                    <strong>{title}</strong>
                    <span>{hint}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <footer className="app-footer">
        Developed by{' '}
        <a href="https://github.com/shreyasgws" target="_blank" rel="noopener noreferrer">
          ShreyasGWS
        </a>
      </footer>
    </main>
  )
}

export default App

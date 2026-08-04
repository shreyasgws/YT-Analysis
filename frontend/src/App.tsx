import { useTranscript } from './hooks/useTranscript'
import { UrlInput } from './components/UrlInput'
import { TranscriptView } from './components/TranscriptView'
import { Skeleton } from './components/Skeleton'
import { CheckIcon } from './components/icons'

const FEATURES = [
  'Local AI',
  'No API Keys',
  'Markdown Export',
  'Timestamp Navigation',
  'Offline Friendly',
]

const SUPPORTS = ['Tutorials', 'Podcasts', 'Lectures', 'Interviews', 'Courses']

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

  return (
    <main className="app">
      <a className="skip-link" href="#content">
        Skip to content
      </a>

      <header className="app-header">
        <h1 className="reveal">
          YouTube Analysis <span className="accent">Pipeline</span>
        </h1>
        <p className="tagline reveal" style={{ animationDelay: '80ms' }}>
          Analyze, summarize, and study any YouTube video — entirely on your machine.
        </p>
      </header>

      <div className="hero-actions reveal" style={{ animationDelay: '160ms' }}>
        <UrlInput onSubmit={load} disabled={state === 'loading'} />

        <div className="feature-chips">
          {FEATURES.map((feature) => (
            <span className="chip" key={feature}>
              <CheckIcon size={12} />
              {feature}
            </span>
          ))}
        </div>
      </div>

      <p className="powered-by reveal" style={{ animationDelay: '240ms' }}>
        Powered by <strong>YouTube</strong> • <strong>Ollama</strong> •{' '}
        <strong>Qwen3.5</strong> • <strong>React</strong> • <strong>TypeScript</strong>
      </p>

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
          <div className="empty-state">
            <div className="empty-card">
              <h2>Supports</h2>
              <ul className="empty-list">
                {SUPPORTS.map((item) => (
                  <li key={item}>
                    <CheckIcon size={14} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <footer className="app-footer" aria-hidden="true">
        Developed by <span>ShreyasGWS</span>
      </footer>
    </main>
  )
}

export default App

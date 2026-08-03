import { useTranscript } from './hooks/useTranscript'
import { UrlInput } from './components/UrlInput'
import { TranscriptView } from './components/TranscriptView'
import { Skeleton } from './components/Skeleton'

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
        <h1>
          YT <span className="accent">Transcript</span>
        </h1>
        <p className="tagline">
          Paste any YouTube link and get its full transcript in seconds.
        </p>
      </header>

      <UrlInput onSubmit={load} disabled={state === 'loading'} />

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
            <p>
              Try a link like <code>https://www.youtube.com/watch?v=dQw4w9WgXcQ</code>
            </p>
          </div>
        )}
      </div>

      <footer className="app-footer" aria-hidden="true">
        Developed by{' '}
        <a
          className="app-footer-link"
          href="https://github.com/shreyasgws"
          target="_blank"
          rel="noreferrer"
          tabIndex={-1}
        >
          ShreyasGWS
        </a>
      </footer>
    </main>
  )
}

export default App

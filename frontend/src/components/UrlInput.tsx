import { useState } from 'react'
import { extractVideoId, isValidYoutubeUrl } from '../utils/youtube'

interface UrlInputProps {
  onSubmit: (videoId: string) => void
  disabled: boolean
}

export function UrlInput({ onSubmit, disabled }: UrlInputProps) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = url.trim()

    if (!trimmed) {
      setError('Please enter a YouTube link or video ID.')
      return
    }
    if (!isValidYoutubeUrl(trimmed)) {
      setError('That does not look like a valid YouTube link.')
      return
    }

    setError(null)
    onSubmit(extractVideoId(trimmed)!)
  }

  return (
    <form onSubmit={handleSubmit} className="url-form" noValidate>
      <div className="input-row">
        <input
          type="url"
          className="url-input"
          placeholder="Paste a YouTube URL…"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            if (error) setError(null)
          }}
          aria-label="YouTube video URL"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className="submit-btn" disabled={disabled}>
          {disabled ? (
            <>
              <svg className="submit-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeOpacity="0.25"
                  strokeWidth="2.5"
                />
                <path
                  d="M21 12a9 9 0 0 0-9-9"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
              Analyzing…
            </>
          ) : (
            <>
              Analyze video
              <svg
                className="btn-arrow"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </>
          )}
        </button>
      </div>
      {error && <p className="input-error" role="alert">{error}</p>}
    </form>
  )
}

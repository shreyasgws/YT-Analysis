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
          placeholder="Paste a YouTube link here… e.g. https://youtu.be/dQw4w9WgXcQ"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            if (error) setError(null)
          }}
          aria-label="YouTube video URL"
        />
        <button type="submit" className="submit-btn" disabled={disabled}>
          {disabled ? 'Fetching…' : 'Get transcript'}
        </button>
      </div>
      {error && <p className="input-error" role="alert">{error}</p>}
    </form>
  )
}

import { forwardRef } from 'react'
import { ChevronDownIcon, ChevronUpIcon, SearchIcon, XIcon } from './icons'

interface SearchBarProps {
  query: string
  onQueryChange: (query: string) => void
  matchCount: number
  activeIndex: number
  onPrev: () => void
  onNext: () => void
  onClear: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  { query, onQueryChange, matchCount, activeIndex, onPrev, onNext, onClear, onKeyDown },
  ref,
) {
  const hasQuery = query.trim().length > 0

  return (
    <div className="search-wrap">
      <div className="search-box">
        <SearchIcon />
        <input
          ref={ref}
          type="search"
          className="search-input"
          placeholder="Search transcript…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Search transcript"
          autoComplete="off"
        />
        {hasQuery && (
          <button
            type="button"
            className="search-clear"
            onClick={onClear}
            aria-label="Clear search"
          >
            <XIcon size={14} />
          </button>
        )}
      </div>

      {hasQuery && (
        <div className="search-nav">
          <span className="search-meta" aria-live="polite">
            {matchCount === 0
              ? 'No matches'
              : `${activeIndex + 1} / ${matchCount}`}
          </span>
          <button
            type="button"
            className="search-nav-btn"
            onClick={onPrev}
            disabled={matchCount === 0}
            aria-label="Previous match"
            title="Previous match (Shift+Enter)"
          >
            <ChevronUpIcon size={15} />
          </button>
          <button
            type="button"
            className="search-nav-btn"
            onClick={onNext}
            disabled={matchCount === 0}
            aria-label="Next match"
            title="Next match (Enter)"
          >
            <ChevronDownIcon size={15} />
          </button>
        </div>
      )}
    </div>
  )
})

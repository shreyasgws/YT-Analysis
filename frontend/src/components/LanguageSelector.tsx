import { useEffect, useMemo, useRef, useState } from 'react'
import type { CaptionLanguage } from '../types'
import { captionKindLabel } from '../utils/language'
import { CheckIcon, ChevronDownIcon, GlobeIcon, SearchIcon } from './icons'

const SEARCH_THRESHOLD = 8

interface LanguageSelectorProps {
  languages: CaptionLanguage[]
  selectedLang: string | null
  disabled: boolean
  onSelect: (code: string) => void
}

export function LanguageSelector({
  languages,
  selectedLang,
  disabled,
  onSelect,
}: LanguageSelectorProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const searchable = languages.length > SEARCH_THRESHOLD

  const selected = languages.find((language) => language.code === selectedLang) ?? languages[0]

  useEffect(() => {
    if (!open) return
    function handlePointer(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  useEffect(() => {
    if (open && searchable) searchRef.current?.focus()
  }, [open, searchable])

  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return languages
    return languages.filter(
      (language) =>
        language.name.toLowerCase().includes(q) || language.code.toLowerCase().includes(q),
    )
  }, [languages, query])

  if (languages.length === 0) return null

  if (languages.length === 1) {
    const language = languages[0]
    return (
      <span
        className="lang-readonly"
        title={`${language.name} · ${captionKindLabel(language.kind)} captions`}
      >
        <GlobeIcon size={14} />
        {language.name}
        <span className="lang-readonly-kind">{captionKindLabel(language.kind)}</span>
      </span>
    )
  }

  return (
    <div className="lang-select" ref={rootRef}>
      <button
        type="button"
        className="lang-button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select caption language"
        onClick={() => setOpen((current) => !current)}
      >
        <GlobeIcon size={14} />
        <span>{selected?.name ?? 'Language'}</span>
        <ChevronDownIcon size={14} />
      </button>

      {open && (
        <div className="lang-menu" role="listbox" aria-label="Caption languages">
          {searchable && (
            <div className="lang-search">
              <SearchIcon />
              <input
                ref={searchRef}
                type="search"
                className="lang-search-input"
                placeholder="Search languages…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && filtered.length > 0) {
                    event.preventDefault()
                    setOpen(false)
                    onSelect(filtered[0].code)
                  }
                  if (event.key === 'Escape') setOpen(false)
                }}
                aria-label="Search languages"
                autoComplete="off"
              />
            </div>
          )}
          <div className="lang-list">
            {filtered.length === 0 ? (
              <p className="lang-empty">No languages found</p>
            ) : (
              filtered.map((language) => {
                const active = language.code === selected?.code
                return (
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`lang-item${active ? ' active' : ''}`}
                    key={language.code}
                    onClick={() => {
                      setOpen(false)
                      onSelect(language.code)
                    }}
                  >
                    <span className="lang-item-name">{language.name}</span>
                    <span className={`lang-item-kind kind-${language.kind}`}>
                      {captionKindLabel(language.kind)}
                    </span>
                    {active && <CheckIcon size={14} />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CaptionLanguage, FetchState, TranscriptSegment, TranscriptSource, VideoMeta } from '../types'
import { fetchLanguages, fetchTranscript, fetchVideoMeta } from '../api/client'

interface TranscriptState {
  state: FetchState
  videoId: string | null
  meta: VideoMeta | null
  languages: CaptionLanguage[]
  selectedLang: string | null
  segments: TranscriptSegment[]
  fullText: string
  source: TranscriptSource
  isLoadingLanguage: boolean
  error: string | null
}

export interface SelectLanguageResult {
  ok: boolean
  message?: string
}

const initialState: TranscriptState = {
  state: 'idle',
  videoId: null,
  meta: null,
  languages: [],
  selectedLang: null,
  segments: [],
  fullText: '',
  source: 'unknown',
  isLoadingLanguage: false,
  error: null,
}

function sourceFor(languages: CaptionLanguage[], code: string | null): TranscriptSource {
  if (!code) return 'unknown'
  return languages.find((language) => language.code === code)?.kind ?? 'unknown'
}

export function useTranscript() {
  const [data, setData] = useState<TranscriptState>(initialState)
  const requestId = useRef(0)
  const langRequestId = useRef(0)
  const stateRef = useRef<TranscriptState>(initialState)

  useEffect(() => {
    stateRef.current = data
  }, [data])

  const load = useCallback(async (videoId: string) => {
    const id = ++requestId.current
    langRequestId.current++
    setData({ ...initialState, state: 'loading', videoId })

    try {
      const [meta, languages] = await Promise.all([
        fetchVideoMeta(videoId),
        fetchLanguages(videoId),
      ])
      if (requestId.current !== id) return

      if (languages.length === 0) {
        const result = await fetchTranscript(videoId)
        if (requestId.current !== id) return
        setData({
          state: 'success',
          videoId,
          meta,
          languages,
          selectedLang: null,
          segments: result.segments,
          fullText: result.fullText,
          source: 'unknown',
          isLoadingLanguage: false,
          error: null,
        })
        return
      }

      const defaultLang = languages.find((language) => language.code === 'en') ?? languages[0]
      const result = await fetchTranscript(videoId, defaultLang.code)
      if (requestId.current !== id) return
      setData({
        state: 'success',
        videoId,
        meta,
        languages,
        selectedLang: defaultLang.code,
        segments: result.segments,
        fullText: result.fullText,
        source: defaultLang.kind,
        isLoadingLanguage: false,
        error: null,
      })
    } catch (err) {
      if (requestId.current !== id) return
      setData({
        ...initialState,
        state: 'error',
        videoId,
        error: err instanceof Error ? err.message : 'Something went wrong',
      })
    }
  }, [])

  const selectLanguage = useCallback(async (code: string): Promise<SelectLanguageResult> => {
    const current = stateRef.current
    if (!current.videoId || code === current.selectedLang || current.isLoadingLanguage) {
      return { ok: false }
    }

    const langId = ++langRequestId.current
    setData((prev) => ({
      ...prev,
      selectedLang: code,
      source: sourceFor(prev.languages, code),
      isLoadingLanguage: true,
      error: null,
    }))

    try {
      const result = await fetchTranscript(current.videoId, code)
      if (langRequestId.current !== langId) return { ok: false }
      setData((prev) => ({
        ...prev,
        selectedLang: code,
        segments: result.segments,
        fullText: result.fullText,
        isLoadingLanguage: false,
      }))
      return { ok: true }
    } catch (err) {
      if (langRequestId.current !== langId) return { ok: false }
      setData((prev) => ({
        ...prev,
        selectedLang: current.selectedLang,
        source: sourceFor(prev.languages, current.selectedLang),
        isLoadingLanguage: false,
      }))
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Failed to load captions.',
      }
    }
  }, [])

  const reset = useCallback(() => {
    requestId.current++
    langRequestId.current++
    setData(initialState)
  }, [])

  return { ...data, load, selectLanguage, reset }
}

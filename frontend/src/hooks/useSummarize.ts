import { useCallback, useEffect, useRef, useState } from 'react'
import { pollProgress, startSummarize, type SummarizePayload } from '../api/analysisClient'

export type SummarizeState = 'idle' | 'running' | 'done' | 'error'

export interface SummarizeProgress {
  done: number
  total: number
  phase: string
}

const POLL_INTERVAL_MS = 1500
const STORAGE_KEY = 'ytAnalysis.activeSummary'

interface StoredJob {
  jobId: string
  videoId: string
  lang: string | null
  savedAt: number
}

function readStoredJob(): StoredJob | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredJob
    if (typeof parsed.jobId !== 'string' || typeof parsed.videoId !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

function saveStoredJob(job: StoredJob): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(job))
  } catch {
    // storage unavailable — resume-after-refresh degrades gracefully
  }
}

function clearStoredJob(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function useSummarize(videoId: string, lang: string | null) {
  const [state, setState] = useState<SummarizeState>('idle')
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [progress, setProgress] = useState<SummarizeProgress | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cached, setCached] = useState(false)
  const runId = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      // The timer is created after this effect runs, so it must be read from the ref at
      // cleanup time; the refs are intentionally the source of truth.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      runId.current++
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      const timer = timerRef.current
      if (timer) clearInterval(timer)
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const beginPolling = useCallback(
    (jobIdToPoll: string) => {
      const id = ++runId.current
      stopPolling()
      setState('running')
      setMarkdown(null)
      setProgress({ done: 0, total: 0, phase: 'queued' })
      setJobId(jobIdToPoll)
      setError(null)
      setCached(false)

      let heldMarkdown = false

      const poll = async () => {
        if (runId.current !== id) return
        let res
        try {
          res = await pollProgress(jobIdToPoll)
        } catch (err) {
          if (runId.current !== id) return
          stopPolling()
          clearStoredJob()
          setState('error')
          setError(err instanceof Error ? err.message : 'Failed to check progress.')
          return
        }
        if (runId.current !== id) return

        if (res.lost) {
          stopPolling()
          clearStoredJob()
          if (heldMarkdown) return
          setState('error')
          setError('Summary job is no longer available (expired or server restarted). Summarize again.')
          return
        }

        if (res.error) {
          stopPolling()
          clearStoredJob()
          setState('error')
          setError(res.error)
          return
        }

        setProgress({ done: res.done, total: res.total, phase: res.phase })

        if (res.markdown !== undefined) {
          heldMarkdown = true
          if (res.cached !== undefined) setCached(res.cached)
          setMarkdown(res.markdown)
          stopPolling()
          clearStoredJob()
          setState('done')
        }
      }

      timerRef.current = setInterval(poll, POLL_INTERVAL_MS)
      void poll()
    },
    [stopPolling],
  )

  const start = useCallback(
    async (payload: SummarizePayload) => {
      let currentJobId: string
      try {
        const result = await startSummarize(payload)
        currentJobId = result.jobId
      } catch (err) {
        setState('error')
        setError(err instanceof Error ? err.message : 'Failed to start summarization.')
        return
      }
      saveStoredJob({
        jobId: currentJobId,
        videoId: payload.videoId,
        lang: payload.lang,
        savedAt: Date.now(),
      })
      beginPolling(currentJobId)
    },
    [beginPolling],
  )

  useEffect(() => {
    const stored = readStoredJob()
    if (!stored) return
    if (stored.videoId !== videoId) return
    if ((stored.lang ?? null) !== (lang ?? null)) return
    beginPolling(stored.jobId)
  }, [videoId, lang, beginPolling])

  const reset = useCallback(() => {
    runId.current++
    stopPolling()
    clearStoredJob()
    setState('idle')
    setMarkdown(null)
    setProgress(null)
    setJobId(null)
    setError(null)
    setCached(false)
  }, [stopPolling])

  return { state, markdown, progress, jobId, error, cached, start, reset }
}

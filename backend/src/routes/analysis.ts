import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { normalizeVideoId } from '../services/youtube'
import { runSummarization, getProgress, QueueFullError } from '../services/ai/summarize'
import type { SummarizePayload } from '../types'

export const analysisRouter = Router()

analysisRouter.post('/summarize', async (req, res) => {
  const body = req.body as Partial<SummarizePayload>

  const videoId = typeof body.videoId === 'string' ? normalizeVideoId(body.videoId) : null
  if (!videoId) {
    res.status(400).json({ error: 'Invalid or missing videoId.' })
    return
  }
  if (typeof body.title !== 'string' || body.title.trim() === '') {
    res.status(400).json({ error: 'Invalid or missing title.' })
    return
  }
  if (body.lang !== null && typeof body.lang !== 'string') {
    res.status(400).json({ error: 'Invalid lang.' })
    return
  }
  if (!Array.isArray(body.paragraphs) || body.paragraphs.length === 0) {
    res.status(400).json({ error: 'Invalid or missing paragraphs.' })
    return
  }
  for (const p of body.paragraphs) {
    if (
      !p ||
      typeof p.text !== 'string' ||
      p.text.trim() === '' ||
      !Number.isFinite(p.startMs) ||
      !Number.isFinite(p.endMs)
    ) {
      res.status(400).json({ error: 'Invalid paragraph entry.' })
      return
    }
  }

  try {
    const jobId = await runSummarization(
      { videoId, title: body.title.trim(), lang: body.lang, paragraphs: body.paragraphs },
      randomUUID(),
    )
    res.status(202).json({ jobId })
  } catch (err) {
    if (err instanceof QueueFullError) {
      res.status(429).json({ error: 'Too many summarization jobs queued. Try again in a moment.' })
      return
    }
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error.' })
  }
})

analysisRouter.get('/progress/:jobId', (req, res) => {
  const job = getProgress(req.params.jobId)
  if (!job) {
    res.status(404).json({ error: 'Unknown job.' })
    return
  }
  if (job.phase === 'error') {
    res.json({ done: job.done, total: job.total, phase: job.phase, error: job.error })
    return
  }
  if (job.phase === 'done' && job.result) {
    res.json({
      done: job.done,
      total: job.total,
      phase: job.phase,
      markdown: job.result.markdown,
      cached: job.result.cached,
    })
    return
  }
  res.json({ done: job.done, total: job.total, phase: job.phase })
})

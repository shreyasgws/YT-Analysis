import { Router } from 'express'
import { getTranscript, isValidLanguageCode, normalizeVideoId } from '../services/youtube'
import { sendError } from '../errors'

export const transcriptRouter = Router()

transcriptRouter.get('/', async (req, res) => {
  const raw = typeof req.query.videoId === 'string' ? req.query.videoId : ''
  const videoId = normalizeVideoId(raw)

  if (!videoId) {
    res.status(400).json({ error: 'Invalid or missing videoId.' })
    return
  }

  const rawLang = typeof req.query.lang === 'string' ? req.query.lang.trim() : ''
  if (rawLang && !isValidLanguageCode(rawLang)) {
    res.status(400).json({ error: 'Invalid language code.' })
    return
  }
  const lang = rawLang || undefined

  try {
    const result = await getTranscript(videoId, lang)
    res.json(result)
  } catch (err) {
    sendError(res, err)
  }
})

import { Router } from 'express'
import { getLanguages, getVideoMeta, normalizeVideoId } from '../services/youtube'
import { sendError } from '../errors'

export const videoRouter = Router()

videoRouter.get('/meta', async (req, res) => {
  const raw = typeof req.query.videoId === 'string' ? req.query.videoId : ''
  const videoId = normalizeVideoId(raw)

  if (!videoId) {
    res.status(400).json({ error: 'Invalid or missing videoId.' })
    return
  }

  try {
    const meta = await getVideoMeta(videoId)
    res.json(meta)
  } catch (err) {
    sendError(res, err)
  }
})

videoRouter.get('/languages', async (req, res) => {
  const raw = typeof req.query.videoId === 'string' ? req.query.videoId : ''
  const videoId = normalizeVideoId(raw)

  if (!videoId) {
    res.status(400).json({ error: 'Invalid or missing videoId.' })
    return
  }

  try {
    const languages = await getLanguages(videoId)
    res.json({ videoId, languages })
  } catch (err) {
    sendError(res, err)
  }
})

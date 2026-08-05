import express from 'express'
import cors from 'cors'
import { transcriptRouter } from './routes/transcript'
import { videoRouter } from './routes/video'
import { analysisRouter } from './routes/analysis'

const app = express()
const PORT = Number(process.env.PORT ?? 3001)

app.use(cors())
app.use(express.json({ limit: '5mb' }))

// Let the browser cache transcript/meta GETs instead of an app-side Map.
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' && (req.path.startsWith('/transcript') || req.path.startsWith('/video/'))) {
    const maxAge = req.path.startsWith('/transcript') ? 900 : 86400
    res.set('Cache-Control', `public, max-age=${maxAge}`)
  }
  next()
})

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/transcript', transcriptRouter)
app.use('/api/video', videoRouter)
app.use('/api/analysis', analysisRouter)

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found.' })
})

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`)
})

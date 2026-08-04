import type { CaptionLanguage, TranscriptSegment, VideoMeta } from '../types'

const SAMPLE_SENTENCES = [
  'Welcome back everyone, in this video we are going to walk through a complete pipeline from start to finish.',
  'Before we dive into the code, it is important to understand the problem we are actually trying to solve.',
  'The first step is gathering the raw input, which in this case comes from a simple text field on the page.',
  'Once we have the input, we validate it and normalize it into a clean canonical shape.',
  'Next we pass that normalized data through a service layer, keeping the UI completely decoupled from the logic.',
  'One key design decision is to keep network calls behind a single client module, so swapping a mock for a real API is trivial.',
  'The hook then manages the whole lifecycle of the request, exposing idle, loading, success, and error states.',
  'When the request completes, we map the raw response into a typed model that the components can safely consume.',
  'Rendering the transcript is straightforward, but we also add timestamp links that jump straight to a moment in the video.',
  'Error handling matters a lot here, so we surface clear messages and let the user retry without losing their input.',
  'After the transcript is in place, the natural next step is summarization and analysis using a language model.',
  'The architecture we chose makes that extension painless, since the backend already owns all heavy lifting.',
  'Finally, we wrap everything in a clean, responsive layout so it works just as well on mobile as on desktop.',
  'That is the whole flow, thanks for watching and feel free to leave questions in the comments below.',
]

function buildSegments(sentences: string[]): TranscriptSegment[] {
  let offset = 0
  return sentences.map((text) => {
    const duration = Math.max(3, Math.ceil((text.split(' ').length * 300) / 1000) * 1000)
    const segment: TranscriptSegment = { text, offset, duration }
    offset += duration + 500
    return segment
  })
}

export async function fetchMockTranscript(_videoId: string, lang?: string) {
  await new Promise((resolve) => setTimeout(resolve, 800))
  return {
    videoId: _videoId,
    lang: lang ?? null,
    segments: buildSegments(SAMPLE_SENTENCES),
    fullText: SAMPLE_SENTENCES.join(' '),
  }
}

export async function fetchMockVideoMeta(videoId: string): Promise<VideoMeta> {
  await new Promise((resolve) => setTimeout(resolve, 700))
  return {
    videoId,
    title: 'Mock Video Title',
    author: 'Mock Channel',
    thumbnail: '',
    durationSeconds: 214,
    uploadDate: '2024-03-15',
  }
}

export async function fetchMockLanguages(_videoId: string): Promise<CaptionLanguage[]> {
  await new Promise((resolve) => setTimeout(resolve, 600))
  return [
    { code: 'en', name: 'English', kind: 'manual' },
    { code: 'es-419', name: 'Spanish (Latin America)', kind: 'manual' },
    { code: 'hi', name: 'Hindi', kind: 'auto' },
  ]
}

import type { Paragraph, TranscriptSegment } from '../types'

export interface GroupOptions {
  /** Merge until a sentence boundary is reached after at least this many ms. */
  sentenceWindowMs?: number
  /** Hard cap on paragraph span regardless of punctuation. */
  hardCapMs?: number
  /** Break paragraph when a gap between segments exceeds this many ms. */
  gapMs?: number
}

const SENTENCE_END = /[.!?…]["')\]]?$/

export function groupSegments(
  segments: TranscriptSegment[],
  options: GroupOptions = {},
): Paragraph[] {
  const { sentenceWindowMs = 12000, hardCapMs = 20000, gapMs = 4000 } = options

  const paragraphs: Paragraph[] = []
  let buffer: TranscriptSegment[] = []

  const flush = () => {
    if (buffer.length === 0) return
    const first = buffer[0]
    const last = buffer[buffer.length - 1]
    paragraphs.push({
      startMs: first.offset,
      endMs: last.offset + last.duration,
      text: buffer
        .map((s) => s.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    })
    buffer = []
  }

  for (const segment of segments) {
    const previous = buffer[buffer.length - 1]

    if (previous) {
      const span = segment.offset + segment.duration - buffer[0].offset
      const gap = segment.offset - (previous.offset + previous.duration)
      const sentenceDone = SENTENCE_END.test(previous.text)

      if (span >= hardCapMs || gap > gapMs || (span >= sentenceWindowMs && sentenceDone)) {
        flush()
      }
    }

    buffer.push(segment)
  }

  flush()
  return paragraphs
}

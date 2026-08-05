import fs from 'node:fs/promises'
import path from 'node:path'
import { ApiError } from '../../errors'
import { normalizeVideoId } from '../youtube'

export const SUMMARIES_DIR = process.env.SUMMARIES_DIR ?? './summaries'

// Intentional duplication: the frontend `utils/export.ts` needs the same rules for its
// client-side download filename, but that file is browser-only (uses Blob/URL) and cannot
// be imported by the backend. Keep both copies in sync.
function sanitizeFilename(input: string): string {
  const cleaned = input
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80)
  return cleaned || 'transcript'
}

export function validateAndBuildFilename(videoId: string, title: string): string {
  const normalized = normalizeVideoId(videoId)
  if (!normalized) {
    throw new ApiError(400, `Invalid videoId "${videoId}".`)
  }
  return `${sanitizeFilename(title)}_[${normalized}]_sections`
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(SUMMARIES_DIR, { recursive: true })
}

export interface SummaryMeta {
  title: string
  videoId: string
  lang: string | null
  pipelineVersion: string
  promptVersion: string
  modelVersion: string
}

export async function createInProgress(base: string, meta: SummaryMeta): Promise<string> {
  await ensureDir()
  // Only one live run per video (enforced by activeLocks in summarize.ts), so any
  // existing inprogress file for this video is a stale leftover from a crashed or
  // interrupted run. Remove them before creating a fresh one.
  const names = await fs.readdir(SUMMARIES_DIR)
  for (const name of names) {
    if (name.startsWith(base) && name.endsWith('.inprogress.md')) {
      await fs.rm(path.join(SUMMARIES_DIR, name), { force: true })
    }
  }
  const target = path.join(SUMMARIES_DIR, `${base}.inprogress.md`)
  const handle = await fs.open(target, 'wx')
  try {
    const comment = [
      '<!--',
      `Video ID: ${meta.videoId}`,
      `Title: ${meta.title}`,
      `Language: ${meta.lang ?? 'auto'}`,
      `Generated: ${new Date().toISOString()}`,
      `Pipeline Version: ${meta.pipelineVersion}`,
      `Prompt Version: ${meta.promptVersion}`,
      `Model: ${meta.modelVersion}`,
      '-->',
      '',
      '',
    ].join('\n')
    await handle.writeFile(`${comment}# ${meta.title}\n\n`)
  } finally {
    await handle.close()
  }
  return path.resolve(target)
}

export async function finalizeSave(inProgressPath: string, base: string): Promise<string> {
  const candidates = [`${base}.md`, `${base}_v2.md`, `${base}_v3.md`]
  for (const name of candidates) {
    const target = path.join(SUMMARIES_DIR, name)
    try {
      await fs.access(target)
    } catch {
      await fs.rename(inProgressPath, target)
      return path.resolve(target)
    }
  }
  throw new ApiError(500, 'Too many saved summaries for this video.')
}

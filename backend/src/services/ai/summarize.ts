import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Paragraph, SummarizePayload } from '../../types'
import { chat, OllamaUnavailableError, type ChatMessage } from './ollama'
import { createInProgress, finalizeSave, validateAndBuildFilename } from './saveSummary'

export const PIPELINE_VERSION = '1.0.0'
export const PROMPT_VERSION = '1.0.0'
export const MODEL_VERSION = 'qwen3.5:4b-v1'

const CHUNK_MAX_CHARS = Number(process.env.CHUNK_MAX_CHARS ?? 8000)
const MAX_CONCURRENT_JOBS = Number(process.env.MAX_CONCURRENT_JOBS ?? 2)
const MAX_QUEUE_LENGTH = Number(process.env.MAX_QUEUE_LENGTH ?? 10)
const JOB_TTL_MS = Number(process.env.JOB_TTL_MS ?? 1_800_000)
const CACHE_DIR = process.env.CACHE_DIR ?? './cache/summaries'

export class QueueFullError extends Error {
  constructor() {
    super('Too many summarization jobs queued.')
  }
}

export type Phase =
  | 'queued'
  | 'chunking'
  | 'summarizing'
  | 'reducing'
  | 'assembling'
  | 'done'
  | 'error'

export type FailureReason = 'timeout' | 'truncated' | 'empty' | 'parse' | 'schema' | 'error'

export interface JobProgress {
  done: number
  total: number
  phase: Phase
  result?: { markdown: string; cached: boolean }
  error?: string
  finishedAt?: number
}

export interface ReduceResult {
  overview: string
  keyTakeaways: string[]
}

export type ChunkResult =
  | { title: string; summary: string }
  | { failure: FailureReason; excerpt?: string }

interface SectionSummary {
  startMs: number
  title: string
  summary: string
}

interface Chunk {
  content: Paragraph[]
  context: Paragraph | null
}

export const jobProgress = new Map<string, JobProgress>()
const activeLocks = new Map<string, string>()

// --- JSON parsing (two-layer, validated in Step 0) ---

interface JsonExtract {
  title?: string
  summary?: string
  overview?: string
  keyTakeaways?: string[]
}

const KNOWN_KEYS = ['title', 'summary', 'overview', 'keyTakeaways']

function tryStrictParse(stripped: string): Record<string, unknown> | null {
  const start = stripped.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(stripped.slice(start, i + 1)) as Record<string, unknown>
        } catch {
          return null
        }
      }
    }
  }
  return null
}

function readJsonString(input: string, openIdx: number): { value: string; end: number } | null {
  let i = openIdx + 1
  let out = ''
  while (i < input.length) {
    const c = input[i]
    if (c === '\\') {
      const next = input[i + 1]
      if (next === undefined) break
      if (next === 'n') {
        out += '\n'
        i += 2
        continue
      }
      if (next === 't' || next === 'r' || next === 'b' || next === 'f') {
        out += next
        i += 2
        continue
      }
      if (next === '"' || next === '\\' || next === '/') {
        out += next
        i += 2
        continue
      }
      if (next === 'u') {
        const hex = input.slice(i + 2, i + 6)
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16))
          i += 6
          continue
        }
        out += '\\u'
        i += 1
        continue
      }
      out += next
      i += 2
      continue
    }
    if (c === '"') {
      let j = i + 1
      while (j < input.length && ' \t\r\n'.includes(input[j])) j++
      if (j >= input.length || input[j] === ',' || input[j] === '}') {
        return { value: out, end: i + 1 }
      }
      out += '"'
      i += 1
      continue
    }
    if (c === '\n' || c === '\r') {
      out += '\n'
      i += 1
      continue
    }
    out += c
    i += 1
  }
  return null
}

function readJsonArrayOfStrings(input: string, openIdx: number): string[] | null {
  let i = openIdx + 1
  const items: string[] = []
  while (i < input.length) {
    while (i < input.length && ' \t\r\n'.includes(input[i])) i++
    if (input[i] === ']') return items
    if (input[i] === '"') {
      const r = readJsonString(input, i)
      if (!r) return null
      items.push(r.value)
      i = r.end
      continue
    }
    i++
  }
  return null
}

function extractJson(raw: string): JsonExtract | null {
  const stripped = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '')
  const strict = tryStrictParse(stripped)
  if (strict !== null) {
    const out: JsonExtract = {}
    if (typeof strict.title === 'string') out.title = strict.title
    if (typeof strict.summary === 'string') out.summary = strict.summary
    if (typeof strict.overview === 'string') out.overview = strict.overview
    if (
      Array.isArray(strict.keyTakeaways) &&
      strict.keyTakeaways.every((k) => typeof k === 'string')
    ) {
      out.keyTakeaways = strict.keyTakeaways as string[]
    }
    return out
  }

  const start = stripped.indexOf('{')
  if (start === -1) return null

  const result: JsonExtract = {}
  const keyRe = /"([A-Za-z][A-Za-z0-9]*)"\s*:/g
  keyRe.lastIndex = start
  let m: RegExpExecArray | null
  while ((m = keyRe.exec(stripped)) !== null) {
    const key = m[1]
    if (!KNOWN_KEYS.includes(key) || key in result) continue
    let i = keyRe.lastIndex
    while (i < stripped.length && ' \t\r\n'.includes(stripped[i])) i++
    if (stripped[i] === '"') {
      const r = readJsonString(stripped, i)
      if (r) {
        if (key === 'title') result.title = r.value
        else if (key === 'summary') result.summary = r.value
        else if (key === 'overview') result.overview = r.value
        keyRe.lastIndex = r.end
      }
    } else if (stripped[i] === '[' && key === 'keyTakeaways') {
      const arr = readJsonArrayOfStrings(stripped, i)
      if (arr) {
        result.keyTakeaways = arr
        keyRe.lastIndex = i + 1
      }
    }
  }
  return Object.keys(result).length > 0 ? result : null
}

// --- Output cleanup (#10: conservative, never rewrites meaning) ---

export function cleanupArtifacts(text: string): string {
  return text
    .replace(/""/g, '"')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

// --- Validation gate for carry-forward (#6: never feed a bad summary to the next chunk) ---

function isUsableSummary(summary: string): boolean {
  const t = summary.trim()
  if (t.length < 20) return false
  if (/{"|"{"|```/.test(t)) return false
  return true
}

// --- Prompts (hardened in Step 0: no backslashes, no LaTeX, no code fences) ---

const SYSTEM_CHUNK = `You are a lecture summarizer. You always answer with JSON only.
Return a JSON object with exactly two string keys:
- "title": a short, descriptive section heading (a noun phrase, not "Discussion").
- "summary": 3-6 paragraphs of concise study notes covering key claims, named examples,
  and short direct quotes (verbatim).

Strict JSON requirements (these matter):
- Never write backslashes. No LaTeX. Write math as plain text, e.g.
  "MSE = (1/n) * sum((y_hat - y)^2)".
- Never use triple-backtick code fences. Paraphrase code in prose; short identifiers may
  be quoted inline in backticks.
- Keep the entire summary inside one JSON string. Use the two-character sequence
  backslash-n for paragraph breaks. No literal newlines inside the string.

Use light Markdown (bullets, bold) inside "summary" for readability.
Do not include timestamps or any text outside the JSON object.`

const SYSTEM_REDUCE = `You are a study-notes editor. You always answer with JSON only.
Given the timestamped section summaries of a long lecture, return a JSON object with exactly two keys:
- "overview": one paragraph condensing the whole lecture.
- "keyTakeaways": an array of 4-8 short strings of the most important points.
Never write backslashes or LaTeX; math must be plain text. Do not include any text outside the JSON object.`

function chunkPrompt(
  chunk: Chunk,
  prevSummary?: { title: string; summary: string },
): ChatMessage[] {
  const parts: string[] = []
  if (chunk.context) {
    parts.push(`Context (tail of the previous section - do not summarize it):\n${chunk.context.text}`)
  }
  if (prevSummary) {
    parts.push(`Previous section: ${prevSummary.title} - ${prevSummary.summary}`)
  }
  const transcriptText = chunk.content.map((p) => p.text).join('\n')
  parts.push(`Summarize this transcript excerpt into one section.\n\nTranscript:\n${transcriptText}`)
  return [
    { role: 'system', content: SYSTEM_CHUNK },
    { role: 'user', content: parts.join('\n\n') },
  ]
}

function reducePrompt(sections: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_REDUCE },
    { role: 'user', content: `Sections:\n${sections}` },
  ]
}

// --- Preprocessing & chunking (§10) ---

export function isCJK(text: string): boolean {
  return /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(text)
}

export function estimateTokens(text: string): number {
  return text.length / (isCJK(text) ? 2 : 4)
}

function isFragment(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 4) return false
  return !/[.!?…]$/.test(text.trim())
}

export function preprocessParagraphs(paragraphs: Paragraph[]): Paragraph[] {
  const out: Paragraph[] = []
  for (const raw of paragraphs) {
    const text = raw.text.trim().replace(/\s+/g, ' ')
    if (!text) continue
    const prev = out[out.length - 1]
    if (prev && isFragment(text)) {
      prev.text = `${prev.text} ${text}`
      prev.endMs = raw.endMs
      continue
    }
    const para: Paragraph = { startMs: raw.startMs, endMs: raw.endMs, text }
    if (prev && prev.text === para.text) continue
    out.push(para)
  }
  return out
}

export function chunkByParagraphs(
  paragraphs: Paragraph[],
  maxChars: number = CHUNK_MAX_CHARS,
): Chunk[] {
  const chunks: Chunk[] = []
  let current: Paragraph[] = []
  let size = 0
  for (const p of paragraphs) {
    if (current.length > 0 && size + p.text.length > maxChars) {
      chunks.push({ content: current, context: null })
      current = []
      size = 0
    }
    current.push(p)
    size += p.text.length
  }
  if (current.length > 0) chunks.push({ content: current, context: null })
  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1].content
    chunks[i].context = prev[prev.length - 1] ?? null
  }
  return chunks
}

// --- Assembly (§8) ---

function formatTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(secs).padStart(2, '0')
  if (hours > 0) return `${String(hours).padStart(2, '0')}:${mm}:${ss}`
  return `${mm}:${ss}`
}

function insertOverviewBlock(document: string, overview: string, keyTakeaways: string[]): string {
  const block = `${overview}\n\n## Key takeaways\n${keyTakeaways
    .map((t) => `- ${t}`)
    .join('\n')}\n\n`
  const header = document.match(/^# .*\n\n/m)
  if (!header) return document
  return document.replace(/^# .*\n\n/m, (match) => `${match}${block}`)
}

// --- Validation (§12, warnings only) ---

function validateDocument(
  document: string,
  meta: { total: number; sectionSummaries: SectionSummary[]; timestamps: number[]; reduce: ReduceResult | null },
): void {
  const warnings: string[] = []
  const sections = document.match(/^## \[/gm) ?? []
  if (sections.length !== meta.total) {
    warnings.push(`section count ${sections.length} !== expected ${meta.total}`)
  }
  if (document.trim() === '' || sections.length === 0) {
    warnings.push('document empty or missing sections')
  }
  if (/\{"|\{"/.test(document)) {
    warnings.push('possible JSON leakage from the model')
  }
  for (let i = 1; i < meta.timestamps.length; i++) {
    if (meta.timestamps[i] < meta.timestamps[i - 1]) {
      warnings.push(`section timestamp not ascending at index ${i}`)
    }
  }
  const seen = new Set<string>()
  for (const s of meta.sectionSummaries) {
    const norm = s.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
    if (norm && seen.has(norm)) warnings.push(`duplicate section title: ${s.title}`)
    seen.add(norm)
  }
  if (meta.reduce) {
    if (!document.includes('## Key takeaways')) warnings.push('overview block missing')
    const overview = meta.reduce.overview.trim()
    if (meta.sectionSummaries.some((s) => s.summary === overview)) {
      warnings.push('overview identical to a section summary')
    }
    if (meta.reduce.keyTakeaways.length === 0) warnings.push('keyTakeaways empty')
  }
  for (const w of warnings) console.warn(`[summary validation] ${w}`)
}

// --- Cache (§3, §7.4 #36/#38) ---

interface CacheEntry {
  createdAt: number
  pipelineVersion: string
  promptVersion: string
  modelVersion: string
  markdown: string
}

function contentHash(paragraphs: Paragraph[]): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify([PIPELINE_VERSION, PROMPT_VERSION, MODEL_VERSION, paragraphs]))
    .digest('hex')
}

async function cacheGet(hash: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(CACHE_DIR, `${hash}.json`), 'utf8')
    const entry = JSON.parse(raw) as CacheEntry
    if (
      entry.pipelineVersion !== PIPELINE_VERSION ||
      entry.promptVersion !== PROMPT_VERSION ||
      entry.modelVersion !== MODEL_VERSION
    ) {
      return null
    }
    return entry.markdown
  } catch {
    return null
  }
}

async function cacheSet(hash: string, markdown: string): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true })
  const entry: CacheEntry = {
    createdAt: Date.now(),
    pipelineVersion: PIPELINE_VERSION,
    promptVersion: PROMPT_VERSION,
    modelVersion: MODEL_VERSION,
    markdown,
  }
  await fs.writeFile(path.join(CACHE_DIR, `${hash}.json`), JSON.stringify(entry, null, 2), 'utf8')
}

// --- Ollama calls ---

async function summarizeChunk(messages: ChatMessage[]): Promise<ChunkResult> {
  let raw: string
  let truncated: boolean
  try {
    const res = await chat(messages, { numCtx: 40960, numPredict: 2048 })
    raw = res.content
    truncated = res.truncated
  } catch (err) {
    if (err instanceof OllamaUnavailableError) throw err
    return { failure: 'error', excerpt: err instanceof Error ? err.message : String(err) }
  }
  if (truncated) return { failure: 'truncated', excerpt: raw.slice(0, 120) }
  if (raw.trim() === '') return { failure: 'empty', excerpt: '' }
  const parsed = extractJson(raw)
  if (parsed === null) return { failure: 'parse', excerpt: raw.slice(0, 160) }
  if (!parsed.title || !parsed.summary || parsed.title.trim() === '' || parsed.summary.trim() === '') {
    return { failure: 'schema', excerpt: raw.slice(0, 160) }
  }
  return { title: parsed.title.trim(), summary: parsed.summary.trim() }
}

async function reduceOverview(sectionSummaries: SectionSummary[]): Promise<ReduceResult | null> {
  if (sectionSummaries.length === 0) return null
  const sectionsText = sectionSummaries
    .map((s) => `## [${formatTimestamp(s.startMs)}] ${s.title}\n${s.summary}`)
    .join('\n\n')

  let raw: string
  let truncated: boolean
  try {
    const res = await chat(reducePrompt(sectionsText), { numCtx: 65536, numPredict: 4096 })
    raw = res.content
    truncated = res.truncated
  } catch (err) {
    console.warn('[summary] reduce failed:', err instanceof Error ? err.message : String(err))
    return null
  }

  let failure: FailureReason | null = null
  if (truncated) failure = 'truncated'
  else if (raw.trim() === '') failure = 'empty'
  else {
    const parsed = extractJson(raw)
    if (parsed === null) failure = 'parse'
    else if (
      !parsed.overview ||
      !Array.isArray(parsed.keyTakeaways) ||
      parsed.keyTakeaways.length === 0 ||
      parsed.overview.trim() === ''
    ) {
      failure = 'schema'
    } else {
      return {
        overview: cleanupArtifacts(parsed.overview.trim()),
        keyTakeaways: parsed.keyTakeaways.map((k) => cleanupArtifacts(k.trim())).filter(Boolean),
      }
    }
  }
  console.warn(`[summary] reduce failed (${failure}): ${raw.slice(0, 160)}`)
  return null
}

// --- Global FIFO queue (rule 12) ---

let activeJobs = 0
const waitQueue: (() => void)[] = []

function acquire(): Promise<void> {
  if (activeJobs < MAX_CONCURRENT_JOBS) {
    activeJobs++
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    waitQueue.push(() => {
      activeJobs++
      resolve()
    })
  })
}

function release(): void {
  const next = waitQueue.shift()
  if (next) next()
  else activeJobs--
}

// --- TTL sweep (rule 13) ---

const g = globalThis as { __summaryTtlSweep?: boolean }
if (!g.__summaryTtlSweep) {
  g.__summaryTtlSweep = true
  setInterval(() => {
    const now = Date.now()
    for (const [id, job] of jobProgress) {
      if (job.finishedAt && now - job.finishedAt > JOB_TTL_MS) jobProgress.delete(id)
    }
  }, 60_000).unref()
}

export function getProgress(jobId: string): JobProgress | undefined {
  const job = jobProgress.get(jobId)
  if (job && job.finishedAt && Date.now() - job.finishedAt > JOB_TTL_MS) {
    jobProgress.delete(jobId)
    return undefined
  }
  return job
}

// --- Run (§3) ---

export async function runSummarization(payload: SummarizePayload, requestedJobId: string): Promise<string> {
  const { videoId, paragraphs } = payload

  const preprocessed = preprocessParagraphs(paragraphs)
  const hash = contentHash(preprocessed)
  const cached = await cacheGet(hash)
  if (cached !== null) {
    jobProgress.set(requestedJobId, {
      done: 0,
      total: 0,
      phase: 'done',
      result: { markdown: cached, cached: true },
      finishedAt: Date.now(),
    })
    return requestedJobId
  }

  const existing = activeLocks.get(videoId)
  if (existing) return existing

  if (activeJobs >= MAX_CONCURRENT_JOBS && waitQueue.length >= MAX_QUEUE_LENGTH) throw new QueueFullError()

  const jobId = requestedJobId
  activeLocks.set(videoId, jobId)
  jobProgress.set(jobId, { done: 0, total: 0, phase: 'queued' })

  void runPipeline(payload, jobId, hash, preprocessed)
  return jobId
}

async function runPipeline(
  payload: SummarizePayload,
  jobId: string,
  hash: string,
  preprocessed: Paragraph[],
): Promise<void> {
  const { videoId, title, lang } = payload

  await acquire()

  try {
    const base = validateAndBuildFilename(videoId, title)
    const chunks = chunkByParagraphs(preprocessed)
    const total = chunks.length

    jobProgress.set(jobId, { done: 0, total, phase: 'chunking' })

    const inProgressPath = await createInProgress(base, {
      title,
      videoId,
      lang,
      pipelineVersion: PIPELINE_VERSION,
      promptVersion: PROMPT_VERSION,
      modelVersion: MODEL_VERSION,
    })
    const sectionSummaries: SectionSummary[] = []
    const timestamps: number[] = []
    let prevSummary: { title: string; summary: string } | undefined

    for (let i = 0; i < chunks.length; i++) {
      jobProgress.set(jobId, { done: i, total, phase: 'summarizing' })
      const chunk = chunks[i]
      const messages = chunkPrompt(chunk, prevSummary)
      const res = await summarizeChunk(messages)
      if ('title' in res) {
        const start = chunk.content[0].startMs
        const marker = `[${formatTimestamp(start)}]`
        const clean = cleanupArtifacts(res.summary)
        await fs.appendFile(
          inProgressPath,
          `## ${marker} ${res.title}\n\n${clean}\n\n`,
          'utf8',
        )
        sectionSummaries.push({ startMs: start, title: res.title, summary: clean })
        timestamps.push(start)
        if (isUsableSummary(clean)) {
          prevSummary = { title: res.title, summary: clean }
        } else {
          prevSummary = undefined
        }
      } else {
        const start = formatTimestamp(chunk.content[0].startMs)
        const end = formatTimestamp(chunk.content[chunk.content.length - 1].endMs)
        console.warn(
          `[summary] chunk ${i}/${total} failed (${res.failure}): ${res.excerpt ?? ''}`,
        )
        await fs.appendFile(
          inProgressPath,
          `## ⚠️ [${start}–${end}] failed to summarize\n\n`,
          'utf8',
        )
        timestamps.push(chunk.content[0].startMs)
      }
    }

    jobProgress.set(jobId, { done: total, total, phase: 'reducing' })
    const reduce = await reduceOverview(sectionSummaries)

    jobProgress.set(jobId, { done: total, total, phase: 'assembling' })
    let document = await fs.readFile(inProgressPath, 'utf8')
    if (reduce) {
      document = insertOverviewBlock(document, reduce.overview, reduce.keyTakeaways)
    }
    document = cleanupArtifacts(document)
    await fs.writeFile(inProgressPath, document, 'utf8')

    validateDocument(document, { total, sectionSummaries, timestamps, reduce })

    await cacheSet(hash, document)
    jobProgress.set(jobId, {
      done: total,
      total,
      phase: 'done',
      result: { markdown: document, cached: false },
      finishedAt: Date.now(),
    })

    await finalizeSave(inProgressPath, base)
  } catch (err) {
    const current = jobProgress.get(jobId)
    const error =
      err instanceof OllamaUnavailableError
        ? 'Ollama unreachable — start Ollama and try again.'
        : err instanceof Error
          ? err.message
          : String(err)
    console.warn(`[summary] run ${jobId} error: ${error}`)
    jobProgress.set(jobId, {
      done: current?.done ?? 0,
      total: current?.total ?? 0,
      phase: 'error',
      error,
      finishedAt: Date.now(),
    })
  } finally {
    activeLocks.delete(videoId)
    release()
  }
}

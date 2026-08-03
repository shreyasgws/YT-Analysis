# Implementation Plan — AI Summarization (v1, Local Ollama)

Authoritative, consolidated plan. **Rev 5 — scoped down after the architecture review:**
single summary style (`sections`), single model (`qwen3.5:4b`, no model UI), no
save-to-folder button (the run auto-writes the final file). Every decision below has been
argued through — do not redesign, only implement. If anything contradicts the actual
codebase on inspection, stop and flag it rather than adapting silently.

Status: plan only — nothing implemented yet. `qwen3.5:4b` is installed and verified via
`ollama list`. Environment is ready for the Step 0 parser gate.

---

## 1. Goal & scope

**Goal:** Transcript → **one summarized Markdown file**, locally, on your own machine.

```
Transcript (client-grouped paragraphs)
  → Preprocess (dedupe / trim / merge tiny fragments)
  → Smart chunk (paragraph boundaries, 8000 chars, 1-para overlap)
  → Summarize (Ollama qwen3.5:4b, JSON {title, summary}, carry-forward prev section)
  → Reduce (single pass → overview + key takeaways)
  → Assemble (server-side scaffold — model never writes the document structure)
  → Validate (light document checks, warnings only)
  → .inprogress.md (progressive) → rename to versioned final file
```

**Deliberately out of scope for v1 (do not add):**
- Multiple summary styles — v1 ships `sections` only.
- Model choice — v1 uses `qwen3.5:4b` only; no `GET /api/analysis/models`, no dropdown.
- Save-to-summaries button — the run itself writes and renames the final file; nothing
  extra to click.
- Cloud providers, token streaming, structured-output framework/Zod, SSE, chat/Q&A,
  embeddings/RAG, cancel endpoint, crash-resume, split-panel UI.

**Deferred but confirmed cheap to add later** (recorded in §16): `brief`/`detailed`
styles, model selection, save-to-folder for cache hits, fully-structured content schema,
2-level reduce, overlap tuning, filler-word removal.

---

## 2. Environment (verified state)

| Item | Value | Status |
| --- | --- | --- |
| Ollama | v0.30.6, running at `http://localhost:11434` | verified |
| `qwen3.5:4b` | 3.4 GB | **installed** (the only model v1 uses) |
| `qwen3.5:9b` | 6.6 GB | installed earlier, **NOT used in v1** (deferred) |
| `qwen3:8b` | 5.2 GB | installed earlier — the only sanctioned fallback if `<think>` appears |
| Node | backend uses `tsx`, `@types/node ^26` | `AbortSignal.timeout` OK |
| Platform | Windows 10 (win32) | filename/rename rules below account for this |

---

## 3. Architecture (data flow)

```
TranscriptView (paragraphs already grouped client-side, ms everywhere)
   │
   │  POST /api/analysis/summarize
   │  { videoId, title, lang|null, paragraphs: [{startMs,endMs,text}] }
   ▼
routes/analysis.ts   → 202 { jobId }  (long-running; client polls)
   ▼
services/ai/summarize.ts                    services/ai/ollama.ts
   │                                           (native /api/chat — NOT /v1,
   ├─ contentHash = sha256(                     every call sets think:false,
   │     JSON.stringify([PIPELINE_VERSION,      format:"json", temperature:0,
   │       PROMPT_VERSION, MODEL_VERSION,       num_ctx/num_predict per site,
   │       paragraphs]))                        AbortSignal.timeout)
   │     → cache hit? register done,
   │       return (BEFORE any lock)
   ├─ lock check activeLocks[videoId]
   │     → hit? return existing jobId
   ├─ queue.acquire()                       // global gate — MAX_CONCURRENT_JOBS (default 2)
   │     → while queued: phase 'queued'     // FIFO; polls return { done:0, total:0, phase:'queued' }
   ├─ acquire video lock
   │   try {
   │     paragraphs = preprocessParagraphs(paragraphs)
   │     chunks = chunkByParagraphs(paragraphs)     // 1-para overlap
   │     total = chunks.length
   │     jobProgress[jobId] = { done: 0, total, phase: 'chunking' }
   │     for each chunk (serial):
   │       jobProgress[jobId] = { done: i, total, phase: 'summarizing' }
   │       res = summarizeChunk(chunk, prevSummary?) // → {title, summary} | null
   │       append "## [h:mm:ss] {title}\n\n{summary}\n\n"
   │         or "## ⚠️ [h:mm:ss–h:mm:ss] failed to summarize\n\n"
   │       prevSummary = res?.summary               // carry-forward
   │     jobProgress[jobId] = { done: total, total, phase: 'reducing' }
   │     reduce = reduceOverview(allSectionSummaries) // → {overview, keyTakeaways} | null
   │     jobProgress[jobId] = { done: total, total, phase: 'assembling' }
   │     assemble: read .inprogress.md, insert overview + takeaways after title, write back
   │     validate(document, meta)                    // warnings only
   │     cacheSet(hash, finalMarkdown)
   │     jobProgress[jobId] = { done: total, total, phase: 'done', result: { markdown, cached:false } }
   │     finalizeSave(rename .inprogress → versioned final)   // LAST statement in try
   │   } catch (first-call Ollama unreachable):
   │     jobProgress[jobId] = { phase: 'error', error: 'Ollama unreachable' }
   │   } finally {
   │     activeLocks.delete(videoId)                  // AFTER the rename
   │     queue.release()                              // start the next queued job
   │   }
   └─ return requestedJobId
   ▼
GET /api/analysis/progress/:jobId
   ├─ queued    → { done:0, total:0, phase:'queued' }
   ├─ running   → { done, total, phase }        // 'chunking'|'summarizing'|'reducing'|'assembling'
   ├─ finished  → { done, total, phase:'done', markdown, cached }  // served on EVERY poll
   ├─ error     → { phase:'error', error }      // e.g. Ollama unreachable on first call
   └─ unknown or expired (TTL) → 404
```

Two independent write paths (do not conflate):
1. **Cache** `cache/summaries/<hash>.json` — content-hash keyed, skips regeneration.
   A cache hit resolves near-instantly and does **not** produce a saved file.
2. **Saved file** `summaries/<title>_[<videoId>]_sections[_vN].md` — human-named,
   versioned, never overwritten. Written progressively; renamed at the end.

---

## 4. Non-negotiable global rules

1. The frontend **never** calls Ollama directly. All AI calls go through the backend.
2. `ollama.ts` uses the **native** `/api/chat` endpoint (not the OpenAI-compat `/v1`
   route) — `think: false` is silently ignored on `/v1`.
3. Every Ollama call sets, explicitly, every time:
   - `think: false` (qwen3/qwen3.5 families default to thinking; thinking eats the
     `num_predict` budget and emits `<think>` blocks that corrupt the JSON shape)
   - `format: "json"` (grammar-constrained; the parser is the fallback, not the primary)
   - `temperature: 0`
   - `options.num_ctx`: **40960 chunk / 65536 reduce** — per call site, never one constant
   - `options.num_predict`: **2048 chunk / 4096 reduce** — per call site
   - `signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS)` (default 180000)
4. Empty/whitespace-only `content` == parse failure == `done_reason === "length"`
   truncation == failure. All three write the `⚠️` marker and the loop continues.
5. Known quirk: `qwen3:4b` had a documented Ollama bug where `think: false` was ignored.
   If `<think>` output appears from `qwen3.5:4b` during Step 0, **escalate (report it)** —
   do not patch around it in the parser. The only sanctioned fallback model is `qwen3:8b`.
6. Cache-hit check **always** happens before any per-video lock is touched.
7. The lock is released in a `finally`; the `.inprogress.md` → final rename happens
   **inside** the `try`, as the last statement before the `finally`. Never after.
8. Double POST for the same video → the existing `jobId` is returned; both clients poll
   the same job. There is **no 409** in v1 — a single style + single model makes a
   model-mismatch impossible.
9. Progress: `404` only for unrecognized jobIds. Finished entries are **kept** and the
   markdown is served on **every** poll — no stripping, no tombstone, no served-flag.
10. The model is fixed to `qwen3.5:4b`. The payload has **no** `model` field.
11. `PIPELINE_VERSION`, `PROMPT_VERSION`, and `MODEL_VERSION` are explicit constants at the
    top of `summarize.ts` (§5), all part of the cache key. Bump `MODEL_VERSION` manually
    whenever `ollama pull` upgrades `qwen3.5:4b`, so an upgraded model never serves a
    stale summary.
12. `MAX_CONCURRENT_JOBS` (default 2) gates Ollama calls globally — `qwen3.5:4b` runs on
    your CPU/RAM. Jobs beyond the limit wait FIFO and poll as `phase:'queued'`; the API
    shape is unchanged.
13. Finished job entries expire after `JOB_TTL_MS` (default 30 min) via a lazy check on
    `GET /progress` plus a periodic sweep. The saved `.md` and cache files are never
    touched.

---

## 5. Files to create / modify

### Backend

#### `backend/src/types.ts` (modify — add types)
```ts
export interface Paragraph {
  startMs: number
  endMs: number
  text: string
}

export interface SummarizePayload {
  videoId: string
  title: string
  lang: string | null        // nullable — the frontend sends null when a video
  paragraphs: Paragraph[]    //          has no language list
}
```
(No `SummaryStyle` union, no `model`, no `SavePayload` — all removed in the scope-down.
Intentional backend-side copy of the frontend `Paragraph` shape.)

#### `backend/src/index.ts` (modify)
```ts
app.use(express.json({ limit: '5mb' }))   // REPLACE the existing default (100kb) line
```
and mount the new router:
```ts
import { analysisRouter } from './routes/analysis'
app.use('/api/analysis', analysisRouter)
```
Vite's `/api` proxy (`frontend/vite.config.ts`) already forwards all `/api/*`, so no
frontend proxy change is needed — but the routes are unreachable until this mount exists.

#### `backend/src/services/ai/ollama.ts` (new)
- `chat(messages, opts?)` → `{ content, truncated, raw }`
  - `POST ${OLLAMA_URL}/api/chat`, body includes `think:false`, `format:'json'`,
    `temperature:0`, `options:{num_ctx, num_predict}` from opts
  - `signal: AbortSignal.timeout(TIMEOUT_MS)`
  - throw on `!res.ok`; `truncated = data?.done_reason === 'length'`
- Constants: `OLLAMA_URL`, `DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? 'qwen3.5:4b'`,
  `TIMEOUT_MS`. No `listModels` in v1.

#### `backend/src/services/ai/summarize.ts` (new) — the whole brain
- Version constants (defined at the top of the file — all part of the cache key, see
  rule 11 and §7.4 #36):
  - `PIPELINE_VERSION = "1.0.0"` — bump on chunker/reducer/preprocessor/assembly/scaffold changes.
  - `PROMPT_VERSION = "1.0.0"` — bump on any prompt text change (chunk or reduce).
  - `MODEL_VERSION = "qwen3.5:4b-v1"` — bump manually after `ollama pull` upgrades the model
    (digest-based auto-bump is a deferred option, §16).
- `isCJK(text)` — Unicode ranges (CJK Unified Ideographs, Hiragana, Katakana, Hangul).
- `estimateTokens(text)` — `text.length / (isCJK(text) ? 2 : 4)`.
- `preprocessParagraphs(paragraphs)` → `Paragraph[]` (see §10).
- `chunkByParagraphs(paragraphs, maxChars = CHUNK_MAX_CHARS)` → `{ content, context }[]`
  — greedy, never splits a paragraph; `CHUNK_MAX_CHARS` is the **single** config source
  (`env`, default 8000) — never a hardcoded literal; `context` = last paragraph of the
  previous chunk (prompt-only overlap, not part of the section, timestamp, or `total`).
- `extractJson(raw)` — the two-layer tolerant parser (§6), shared by chunk + reduce.
- `summarizeChunk(chunk, prevSummary?)` → `{title, summary} | { failure } | null`
  - `numPredict: 2048`, `numCtx: 40960`
  - prompt: transcript slice (+ the `context` overlap paragraph) + previous-section
    carry-forward when present
  - failure reasons (telemetry for prompt tuning, logged with the chunk index + a short raw
    excerpt): `'timeout' | 'truncated' | 'empty' | 'parse' | 'schema' | 'error'`
  - never throws past this function
- `reduceOverview(sectionSummaries)` → `{overview, keyTakeaways: string[]} | null`
  - `numPredict: 4096`, `numCtx: 65536` (input = all section summaries)
  - skipped (returns null) if there are no section summaries at all
- `runSummarization(payload, requestedJobId): Promise<string>` — returns the **effective**
  jobId (may differ from `requestedJobId`); flow in §3.
- `cacheGet(hash)` / `cacheSet(hash, markdown)` — files at `cache/summaries/<hash>.json`
  holding `{ createdAt, pipelineVersion, promptVersion, modelVersion, markdown }` (metadata
  makes cache inspection/debugging possible). `cacheGet` treats a missing file or a
  version mismatch as a miss.
- `jobProgress: Map<jobId, {done,total,phase,result?,error?,finishedAt?}>`,
  `activeLocks: Map<videoId, jobId>`, a FIFO concurrency queue, and a periodic TTL sweep
  (`JOB_TTL_MS`, default 30 min) that deletes finished entries only — never files.

#### `backend/src/services/ai/saveSummary.ts` (new)
- `sanitizeFilename(title)` — own ~8-line copy (frontend `export.ts` uses browser-only
  `Blob`/`URL`). Add the intentional-duplication comment.
- `validateAndBuildFilename(videoId, title)` — style is fixed to `sections`:
  - `videoId` passed through `normalizeVideoId` (reuse from `services/youtube.ts`),
    else 400
  - then `` `${sanitizeFilename(title)}_[${videoId}]_sections` ``
- `createInProgress(base, title)` → `fs.promises.open(..., 'wx')`; on `EEXIST` try
  `_v2`, `_v3`…; write `# ${title}\n\n`; return resolved path.
- `finalizeSave(inProgressPath, base)` → pick first free `${base}.md`, `_v2.md`, `_v3.md`…
  then `fs.promises.rename(inProgressPath, thatPath)`; return it.

#### `backend/src/routes/analysis.ts` (new)
```
POST /api/analysis/summarize   body {videoId,title,lang,paragraphs}
                                 → 202 { jobId }
GET  /api/analysis/progress/:jobId
                                 → 200 {done,total} | {done,total,markdown,cached}
                                 → 404
```
- `/summarize`: validate body (videoId, title string, paragraphs non-empty array,
  lang string|null). Generate `requestedJobId = crypto.randomUUID()`.
  Respond with the **effective** jobId from `runSummarization`.
- All error paths use the existing `ApiError` + `{ error }` response shape.
- No `/models`, no `/save` in v1.

### Frontend

#### `frontend/package.json` (modify)
Add `react-markdown` (not currently installed — confirmed in `package.json`).

#### `frontend/src/api/analysisClient.ts` (new)
```ts
startSummarize(payload): Promise<{ jobId: string }>
pollProgress(jobId): Promise<ProgressResponse>   // distinguishes 404 explicitly
```
Always hits the real backend. **Mock mode is transcript-only by explicit decision** —
`VITE_USE_MOCK` does not affect the analysis client (documented, not assumed).

#### `frontend/src/hooks/useSummarize.ts` (new)
- Mirrors `useTranscript`'s `requestId` race pattern: every `summarize()` call bumps a
  ref'd counter; stale poll responses are discarded.
- `setInterval` polling every ~1.5s.
- **Stop condition:** stop polling once `response.markdown !== undefined`. A
  `done === total` poll without markdown means the reduce call is still running — keep
  polling.
- Only `setMarkdown` when `response.markdown !== undefined` (a repeated finished-poll must
  not clobber held markdown).
- 404 handling: if no markdown held → "job lost — offer to restart" state; if markdown is
  already held → 404 is benign (stop polling, keep the result).
- Clear the interval in the effect cleanup (unmount), on done, and on 404.
- Expose: `state`, `markdown`, `progress {done,total,phase}`, `jobId`, `error`, `start()`,
  `reset()`.
- No cancel endpoint in v1 — switching videos stops the UI from polling the old job but
  the backend continues generating it (accepted; cancel is Phase 1.3).

#### `frontend/src/components/analysis/SummarizePanel.tsx` (new)
Collapsible panel above the transcript. Needs:
- Summarize / Regenerate button and progress while polling: `{done} / {total}` chunks
  plus the current phase label (`Chunking…`, `Summarizing 7/10`, `Reducing…`,
  `Assembling…`, `Done`).
- **No style tabs, no model dropdown** (v1: `sections`, `qwen3.5:4b`).
- Markdown rendered with `react-markdown` in a plain non-virtualized scrollable div.
- Custom heading renderer: match `^\[(\d+:)?\d{2}:\d{2}\]` at the start of heading text
  (matches both `[12:34]` and `[1:02:34]`), render as a clickable timestamp button.
  **Jump-to-timestamp is NOT a direct reuse of the search mechanism:** parse
  `[h:mm:ss]`/`[mm:ss]` → ms → find the paragraph whose `startMs <= ms` (last such) →
  call the existing scroll-to-paragraph-index function with that index.
- Copy button and Download button (client-side `.md` blob — reuse the `downloadFile`
  pattern from `utils/export.ts`). **No Save-to-summaries button** — the backend already
  wrote and renamed the final file.

---

## 6. Tolerant JSON parser (final form — validated in Step 0)

Used by both `summarizeChunk` and `reduceOverview` — one shared copy, never two.

**Step 0 finding (gate outcome):** `format:"json"` guarantees token-level grammar only,
not strict JSON. Against `qwen3.5:4b`, the model emitted raw LaTeX backslashes (`\(`,
`\cdot`, `\\alpha`), literal newlines inside strings, stray unescaped quotes before direct
quotes, and once even **two** `summary` keys with the second unterminated. A strict
`JSON.parse` of the balanced-brace region failed ~50% of the time — which would have
turned good content into `⚠️` placeholders. So the parser is **two layers**:

1. **Fast path — strict:** locate the first escape-aware balanced-brace region and
   `JSON.parse` it. Used verbatim when it succeeds.
2. **Fallback — string-aware scanner:** scan for the known keys (`title`, `summary`,
   `overview`, `keyTakeaways`), then read each value with a tolerant JSON-string reader:
   - a `"` terminates the string only if what follows (after whitespace) is `,`, `}`, or
     EOF — otherwise it's a stray unescaped quote kept as content;
   - invalid escapes keep the raw character (`\(` → `(`, `\s` → `s`);
   - literal newlines inside a string are tolerated;
   - `keyTakeaways` is read as a string array with the same reader per element.

   When the model emits a duplicated/`keyTakeaways`-style malformed tail, the scanner takes
   the **first** well-formed value for each key and ignores the rest. The shape check still
   applies to whatever it returns.

**Prompt hardening complements the parser** (also a Step 0 outcome): the chunk/reduce
system prompts forbid backslashes/LaTeX and triple-backtick code fences (math as plain
text, code paraphrased). This eliminates most malformed output at the source — but the
scanner remains the real safety net, because the model still ignores the no-backslash rule
~50% of the time on math-heavy content (it emitted `$\\alpha$`, `\cdot` in a passing run).

**Failure contract** (all equivalent → `⚠️` marker, continue):
`extractJson(content) === null` OR `content.trim() === ''` OR `result.truncated === true`
OR the extracted shape is missing/empty `title`/`summary` (or `overview`/`keyTakeaways`
for reduce).

The validated reference implementation is `backend/scratch/parser-test.ts` (7/7 runs
passed across short-lecture, technical/code-heavy, informal-speech, and reduce cases).

---

## 7. Problems & loopholes → perfect solutions (complete register, v1 scope)

### 7.1 Data integrity & concurrency
| # | Problem / loophole | Solution |
| --- | --- | --- |
| 1 | Two concurrent runs for the same video interleave appends into the same `.inprogress.md` | `wx`-flag create + `_v2/_v3` bump (Step `createInProgress`); per-video `activeLocks` map |
| 2 | Lock released before the rename → a second run can claim the in-progress name and then have its open file renamed underneath it; `fs.appendFile` silently recreates the path, wiping earlier chunks | Rename is the **last statement inside the `try`**; lock released only in `finally`, after the rename |
| 3 | Crash leaves an orphaned `.inprogress.md` that blocks or corrupts the next run | `wx` create fails with `EEXIST` → version-bump automatically; orphan is always hand-salvageable |
| 4 | Server restart mid-run: in-memory job registry is gone | `GET /progress/:jobId` → 404; frontend surfaces "job lost — restart?"; the `.inprogress.md` on disk remains readable |
| 5 | Cache-hit request blocking on a concurrent same-video run | Cache check happens **before** any lock is consulted |
| 6 | Double POST (double-click / two tabs) starts two runs | Lock hit → return the **existing** jobId; both clients poll the same job |
| 7 | A job that throws between lock acquire/release leaks the lock forever | `try { … } finally { activeLocks.delete(videoId) }` |
| 8 | Completed job's markdown misread after a re-poll | Finished entries are kept; markdown is served on **every** poll (no served-flag, no stripping, no tombstone) |
| 9 | Crash/disk-full during an append can corrupt the in-progress file | Per-chunk `appendFile`; a crash loses at most the tail of the current chunk. An optional `handle.sync()` (`fsync`) after each append is available if durability matters — not the default (local tool) |
| 10 | User launches many videos at once → 30 Ollama jobs hammer one CPU/RAM | Global FIFO gate, `MAX_CONCURRENT_JOBS` (default 2); queued jobs poll as `phase:'queued'`. The API shape is unchanged |
| 11 | `jobProgress` grows forever — 500 finished jobs leak RAM | Finished entries expire after `JOB_TTL_MS` (default 30 min): lazy check on `GET /progress` + a periodic sweep. The saved `.md` and cache files are never touched |

### 7.2 Ollama API pitfalls
| # | Problem / loophole | Solution |
| --- | --- | --- |
| 12 | Ollama's default `num_ctx` is **2048** — a ~2–3k-token chunk is silently truncated | Explicit `options.num_ctx` on every call (40960 chunk / 65536 reduce) |
| 13 | `num_predict` truncation yields a valid-but-incomplete JSON that still parses → silent partial sections | Check `done_reason === 'length'` → treat as failure even if it parses |
| 14 | qwen3/qwen3.5 default to **thinking mode**; thinking tokens consume `num_predict` (can return empty content) and emit `<think>` blocks | `think: false` on every call, native `/api/chat` only (`/v1` ignores it) |
| 15 | Unbounded generation time on CPU (chunks can take minutes) | `AbortSignal.timeout(OLLAMA_TIMEOUT_MS)` per call (default 180s) |
| 16 | `format:"json"` guarantees syntax-only grammar — not strict JSON (Step 0: raw LaTeX backslashes, unescaped quotes, duplicated keys) | Two-layer parser (§6): strict `JSON.parse` fast path + string-aware scanner; explicit shape check remains |
| 17 | OpenAI-compat `/v1` route silently ignores `think:false` | Hard requirement: native `/api/chat` only |
| 18 | `<think>` output from `qwen3.5:4b` (documented `qwen3:4b` bug precedent) | Escalate in Step 0 — do not patch the parser around it; only sanctioned fallback is `qwen3:8b` |

### 7.3 Model behavior & quality
| # | Problem / loophole | Solution |
| --- | --- | --- |
| 19 | Model hallucinates/mangles timestamps when asked to echo `startMs`/`endMs` | Model returns `{title, summary}` **only**; timestamps stamped server-side from `chunk.content[0].startMs` |
| 20 | `mm:ss` is wrong for multi-hour classes (`[150:00]`) | `h:mm:ss` formatting matching `formatSeconds` (`[12:34]` / `[1:02:34]`); frontend regex `^\[(\d+:)?\d{2}:\d{2}\]` |
| 21 | `chars/4` token estimate badly undercounts CJK transcripts (1–1.5 tok/char) | `estimateTokens` branches to `chars/2` for CJK; `CHUNK_MAX_CHARS=8000` for margin |
| 22 | Reduce call input (all section summaries) can approach 40960 tokens | `num_ctx: 65536` for the reduce call (qwen3.5 supports 256K); 2-level reduce is the documented tuning knob, not built now |
| 23 | Chunk ends mid-story / chunk N has no memory of chunk 1 | Paragraph-boundary chunking (never splits a paragraph) + **1-para overlap** (`context`) + **carry-forward** of the previous section summary into the next prompt |
| 24 | Raw captions contain duplicate lines, whitespace noise, and broken fragments that lower quality | Preprocessing stage (§10): dedupe, collapse whitespace, merge tiny fragments |
| 25 | Nondeterministic output across cache-miss re-runs | `temperature: 0` on every call; cache key includes `PROMPT_VERSION` + `MODEL_VERSION` + `PIPELINE_VERSION` |
| 26 | Summary quality is never evaluated — prompt changes become guesswork | §9: fixed criteria + 3-transcript test corpus + recorded scores + gate before prompt changes |
| 27 | Cache key ignores a model upgrade — an updated `qwen3.5:4b` could serve a stale summary | `MODEL_VERSION` constant in the cache key; bumped manually after `ollama pull` upgrades the model. Auto-invalidation via the model digest from `/api/tags` is a deferred option (§16) |
| 28 | `extractJson` failures give no clue *why* (timeout vs truncation vs schema) | `summarizeChunk`/`reduceOverview` return a typed `failure` reason (`'timeout'|'truncated'|'empty'|'parse'|'schema'|'error'`), logged with the stage/chunk index and a short raw excerpt |

### 7.4 Backend / API correctness
| # | Problem / loophole | Solution |
| --- | --- | --- |
| 29 | Express `express.json()` default 100kb body limit → 413 on a multi-hour transcript | `express.json({ limit: '5mb' })`, replacing the existing line |
| 30 | New router created but never mounted → 404 on every `/api/analysis/*` call | Explicit `app.use('/api/analysis', analysisRouter)` in `index.ts` |
| 31 | Backend has no `Paragraph` type | Add `Paragraph`, `SummarizePayload` to `backend/src/types.ts` |
| 32 | `createInProgress` needs the title for the header | Signature `createInProgress(base, title)`; caller passes both |
| 33 | `runSummarization`'s effective-jobId contract undefined (cache/lock hits answer with a different id) | Return value is the effective jobId; the route responds with exactly that |
| 34 | Filename built from unsanitized `videoId`/`title` → path traversal / malformed names | Shared `validateAndBuildFilename`: `videoId` via `normalizeVideoId`, title via `sanitizeFilename` |
| 35 | `lang` typed as required string, but frontend sends `null` | `lang: string | null`, accepted in validation |
| 36 | `contentHash` algorithm unspecified / ignores pipeline changes | `crypto.createHash('sha256')` of `JSON.stringify([PIPELINE_VERSION, PROMPT_VERSION, MODEL_VERSION, paragraphs])`; bump the matching constant on prompt/pipeline/model changes (§5) |
| 37 | Timestamp format ambiguity (`[12:34]` vs `[1:02:34]`) in the assembled document | One shared server formatter; frontend regex covers both forms |
| 38 | Bare-markdown cache files are opaque to inspection/debugging | Cache stores `{ createdAt, pipelineVersion, promptVersion, modelVersion, markdown }` per hash |

### 7.5 Frontend correctness
| # | Problem / loophole | Solution |
| --- | --- | --- |
| 39 | Stale result shown after switching videos mid-poll | `useTranscript`'s `requestId` race pattern, copied verbatim |
| 40 | Poll interval leaks on unmount | Clear in effect cleanup, on done, and on 404 |
| 41 | 404 after a finished job misread as "job lost" | 404 is benign once markdown is held; only otherwise show restart state |
| 42 | Repeated finished-poll (markdown again) clobbers held markdown | Only `setMarkdown` when `response.markdown !== undefined` |
| 43 | `react-markdown` not installed | Add dependency; plain scrollable div (a summary is a few KB — no virtualization) |
| 44 | Jump-to-timestamp assumed to reuse search's scroll directly (search takes a *paragraph index*, we have a timestamp) | Convert `[h:mm:ss]` → ms → find last paragraph with `startMs <= ms` → call scroll-to-index |
| 45 | Mock mode (`VITE_USE_MOCK`) assumption | Documented decision: analysis client always hits the real backend; mock remains transcript-only |
| 46 | Reduce step shows "100%" then a silent wait | `phase` field in progress responses; the UI renders the current stage (`Chunking…`, `Summarizing 7/10`, `Reducing…`, `Assembling…`, `Done`) |

### 7.6 Process / operations
| # | Problem / loophole | Solution |
| --- | --- | --- |
| 47 | Building the whole pipeline on an unproven JSON assumption | Step 0: throwaway parser prototype against the real model **before any other code**; hard gate |
| 48 | Environment not ready (Ollama/model missing) | Step -1: verified `ollama pull qwen3.5:4b` + `ollama list` (done — model installed) |
| 49 | The "highest-risk path" has no fallback | `format:"json"` + tolerant parser + `⚠️` skip-and-continue (three independent defenses) |
| 50 | `cache/` and `summaries/` output dirs not defined/created | `SUMMARIES_DIR`, `CACHE_DIR` env with `./summaries`, `./cache/summaries` defaults; `fs.mkdir({ recursive: true })` on first use |

---

## 8. Output specification (v1 — fixed scaffold, every run)

```
# {title}

{overview}                                ← plain paragraph from reduce (omit if reduce failed)

## Key takeaways
- {takeaway}
- {takeaway}

## [h:mm:ss] {section title}              ← one `## ` section per chunk, in transcript order
{section prose — model markdown, inline only}

## [h:mm:ss] {section title}
...
```

- The server owns the entire scaffold. The model never emits `#` or `##` — it only returns
  `{title, summary}` (or `{overview, keyTakeaways}` for the reduce call), which the server
  places into this fixed structure. Formatting cannot vary run to run.
- Section timestamp = `chunk.content[0].startMs`, formatted `h:mm:ss` when ≥ 1h, else
  `mm:ss`, via the single shared formatter (mirrors frontend `formatSeconds`).
- The overview + takeaways block appears once, immediately after the title, always in the
  same position.
- Failed-chunk placeholder (per-chunk, not the whole document):
  `## ⚠️ [h:mm:ss–h:mm:ss] failed to summarize`
- If the reduce call fails (or there were zero successful sections): the
  overview/takeaways block is **omitted entirely**; the document remains sections-only.
  No placeholder for the reduce itself.

---

## 9. Prompt quality strategy

**Criteria for "good"** (what a section must preserve):
- Key claims and the lecture's logical structure.
- Named examples and their gist.
- Equations/formulas verbatim where short.
- Short direct quotes verbatim.
- No invented facts; numbers/dates correct.
- Compression ~5–10× of the chunk.
- Section headings descriptive, not generic (`3.1 Quantum superposition` not `Discussion`).

**Process:** a fixed test corpus of 3 transcripts (short technical, long informal lecture,
one CJK if available) lives at `prompts/`. Before any prompt or pipeline change ships,
run the corpus and score each output against the criteria into `prompts/EVALUATION.md`.
No prompt edits without a recorded evaluation. Manual for v1 — no framework, no table,
just a checklist per transcript.

---

## 10. Preprocessing & chunking spec

`preprocessParagraphs(paragraphs)` → `Paragraph[]`:
- drop empty / whitespace-only paragraphs;
- collapse internal whitespace runs to a single space;
- drop consecutive duplicates (caption retranslation artifacts);
- merge fragments under ~4 words with no terminal punctuation into the previous paragraph.

`chunkByParagraphs(preprocessed, maxChars=8000)` → `{ content, context }[]`:
- greedy accumulate by paragraph, never splitting a paragraph;
- `content` = the paragraphs of this chunk (these define the section, its timestamp
  `content[0].startMs`, and progress `total`);
- `context` = the **last paragraph of the previous chunk**, prepended to the prompt only
  (the 1-para overlap — keeps a story spanning a boundary coherent; not summarized,
  not timestamped, not counted);
- `context` of chunk 0 is empty.

## 11. Reduce & carry-forward

- `sectionSummaries: { startMs, title, summary }[]` accumulates one entry per successful
  chunk. The next chunk's prompt receives `Previous section: {title} — {summary}` as
  continuity context (carry-forward).
- `reduceOverview(sectionSummaries)` → `{overview, keyTakeaways: string[]}` — one call,
  input = all section summaries, `num_ctx: 65536`, `num_predict: 4096`. If
  `sectionSummaries` is empty (all chunks failed) it is skipped.

## 12. Validation (light, warnings only — never fails a run)

After assembly, before cache-set:
- section count === `total` chunks (every chunk yields exactly one `## ` section,
  including `⚠️` placeholders);
- document is non-empty and contains at least one `## ` section;
- markdown is not obviously malformed (balanced section markers, no raw `{"`-style JSON
  leakage from the model);
- section timestamps are in ascending order;
- duplicate or near-identical section titles → warn;
- if reduce succeeded: the overview block is present, `overview` text is not identical to
  any section's summary, and `keyTakeaways` is non-empty.

Warnings are logged server-side. A mismatch is never fatal — the file still completes.

---

## 13. Build order (do not skip ahead)

1. **Step -1 — Environment** (DONE): Ollama running, `qwen3.5:4b` installed.
2. **Step 0 — Parser prototype** (`backend/scratch/parser-test.ts`, throwaway): **DONE** —
   gate passed 7/7. Findings: (a) `format:"json"` does not guarantee strict JSON from
   `qwen3.5:4b` (raw LaTeX backslashes, unescaped quotes, literal newlines, even a
   duplicated `summary` key) → the tolerant parser is a two-layer strict-then-scanner
   design (§6); (b) the chunk/reduce prompts must forbid backslashes/LaTeX and code
   fences (math as plain text). `<think>` absent, no truncation at `num_predict`
   2048/4096. The prototype's `extractJson` + prompts are the reference for `summarize.ts`.
3. **Steps 1–6 — backend** (DONE): implemented in this order — `types.ts` (`Paragraph`,
   `SummarizePayload`) → `services/ai/ollama.ts` → `services/ai/saveSummary.ts` →
   `services/ai/summarize.ts` → `routes/analysis.ts` → `index.ts` (5mb body limit,
   `/api/analysis` router mount). `npm run typecheck` green at every step. In-process
   pipeline test + full curl e2e (`backend/scratch/e2e.ps1`) + proxy e2e all passed;
   Ollama-unreachable path returns `{"phase":"error","error":"Ollama unreachable — start
   Ollama and try again."}`. Note: the plan originally listed `index.ts` as step 1; the
   implementation kept the mount for last since it imports the router.
4. **Step 7 — frontend** (DONE): `react-markdown` installed; `api/analysisClient.ts`,
   `hooks/useSummarize.ts`, `components/analysis/SummarizePanel.tsx`; `TranscriptView.tsx`
   and `VirtualTranscriptBody.tsx` wired (timestamp-jump via `jumpRequest`), `App.css`
   styles. `npm run lint` (no new warnings) + `npm run build` green; full summarize flow
   verified through the Vite `/api` proxy with live Ollama.
5. **Verification** — `npm run typecheck` (backend), `npm run lint`/`npm run build`
   (frontend): **all green**. Automated acceptance runs (`backend/scratch/final-verify.ps1`,
   throwaway): **12/12 PASS** — #1 single-chunk output structure, #5 same-video dedupe,
   #16 concurrency (MAX_CONCURRENT_JOBS=2 → third job `queued`, FIFO drain, all complete,
   files written), #17 job TTL (finished job → 404 after expiry, saved file + cache
   survive). #2/#3/#6/#7/#12/#14 also verified in earlier gates. Remaining checklist
   items (#4 kill mid-run, #8 forced chunk failure, #9 CJK, #11 duplicate titles,
   #13 100k+ words, #15 language-switch UI) are manual browser checks.

---

## 14. Acceptance checklist (all must pass)

1. **Short video** (one chunk) — no chunking path, single Ollama call, correct output.
2. **Long video** (multi-chunk + reduce) — `.inprogress.md` grows progressively; final
   file has the title, overview, key takeaways, and all timestamped sections in order.
3. **Ollama stopped** — summarize request fails with a clear, actionable error
   ("Start Ollama"); UI shows it without crashing.
4. **Kill backend mid-run** — `.inprogress.md` holds all completed sections, human-readable;
   restart; new run for the same video version-bumps instead of colliding.
5. **Double-click / two tabs (same video)** — same `jobId` returned; one run.
6. **Poll stale jobId after restart** — 404; frontend shows "restart" (only if no
   markdown held).
7. **Cache hit** — second identical run returns `cached:true` near-instantly; no saved
   file is produced (nothing to write), and the UI still renders the markdown.
8. **Forced chunk failure** (absurdly low `num_predict` or stop Ollama mid-run) — `⚠️`
   marker for that section; run completes; section count still matches `total`.
9. **CJK transcript** (if available) — no context overflow; no garbled/truncated output.
10. **Reduce still running** (`done===total` but no markdown yet) — UI keeps polling, then
    shows markdown when the reduce finishes.
11. **Duplicate/near-identical section titles** — warnings logged, run completes.
12. **Poll after finish** — markdown returned on every poll; UI never shows "job lost" for
    a finished job.
13. **Very large transcript (100k+ words)** — completes; memory stays bounded (only one
    chunk + one section summary held at a time; the file is appended, never buffered);
    no stage exceeds its limits.
14. **Phase display** — progress shows `Chunking → Summarizing → Reducing → Assembling →
    Done` with no silent "100%" hang during the reduce pass.
15. **Language switching (en → ml → en)** — each language summarizes its own transcript;
    cache keys do not collide across languages (different paragraphs → different hash); no
    stale transcript is reused.
16. **Concurrency + queue** — starting 3+ videos with `MAX_CONCURRENT_JOBS=2` runs two,
    queues the rest as `phase:'queued'`, and drains FIFO as slots free; all complete.
17. **Job TTL** — a finished job (or an old finished job whose client stopped polling) is
    removed from `jobProgress` after `JOB_TTL_MS`; its saved file and cache entry remain;
    a poll of the expired job returns 404.

---

## 15. Config (env)

```
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen3.5:4b          # v1 model — used for all calls, no UI choice
OLLAMA_TIMEOUT_MS=180000
SUMMARIES_DIR=./summaries
CACHE_DIR=./cache/summaries
CHUNK_MAX_CHARS=8000             # single source for chunking — never hardcoded elsewhere
MAX_CONCURRENT_JOBS=2            # global Ollama gate; extra jobs queue (phase 'queued')
MAX_QUEUE_LENGTH=10              # jobs allowed to wait; excess → HTTP 429
JOB_TTL_MS=1800000               # finished job entries expire after 30 min (files untouched)
```
Internal, not env — cache key constants (see §5): `PIPELINE_VERSION`, `PROMPT_VERSION`,
`MODEL_VERSION`.

### Review-pass changes (implemented, verified)

- Cache key hashes the **preprocessed** paragraph stream (not the raw payload).
- `MAX_QUEUE_LENGTH` (default 10) — the full-check only fires when a job would actually
  queue (all slots busy); with a slot free the job starts immediately regardless of queue
  capacity. Over capacity → `QueueFullError` → HTTP 429.
- Every saved markdown starts with an HTML comment (`<!-- Video ID / Title / Language /
  Generated ISO / Pipeline Version / Prompt Version / Model -->`) written before the title.
- Carry-forward is gated by `isUsableSummary` (short / JSON-ish / code-fence output drops
  the previous context).
- `cleanupArtifacts` (exported) applied to chunk summaries, overview, takeaways, and the
  final document **and persisted** to the file before finalize.
- Frontend `useSummarize(videoId, lang)` persists the active job in `localStorage`
  (`ytAnalysis.activeSummary`) and resumes polling on refresh when the stored
  videoId/lang still match.
- Verified: `scratch/v2-structure.ps1` 16/16, queue/429 test PASS, backend typecheck +
  frontend lint/build green. Follow-up items from the architecture review (#3 cache expiry,
  #5 adjacent-summary similarity, #7 run-stats logging) are recorded in §16.

---

## 16. Follow-ups (deferred, recorded — do not build now)

- `brief`/`detailed` styles (same pipeline, more prompt templates).
- Model selection: `GET /api/analysis/models` + dropdown, `qwen3.5:9b` quality tier.
- Save-to-folder button for cache hits (nothing to save in v1 — the run auto-writes).
- Fully-structured content schema (e.g. `{sections: [{heading, paragraphs[]}]}`) —
  `format:"json"` already makes this a cheap schema change later.
- 2-level reduce for very long transcripts.
- Overlap tuning (paragraph count of `context`).
- Filler-word removal (risky without evaluation — see §9).
- **Backend-fetched summarize** — `POST /summarize {videoId, lang}` where the backend owns
  fetch + grouping. Eliminates the full-transcript upload (4–8 MB / 40k paragraphs per
  request) and any frontend/backend transcript mismatch; backend becomes the single source
  of truth. The client-supplied `paragraphs` API stays for v1.
- **Token-based chunking** — estimate tokens and target ~60–70% of the context window
  instead of a fixed character count.
- **Auto cache invalidation** via the Ollama model digest from `/api/tags` (replaces the
  manual `MODEL_VERSION` bump).
- **Per-append `fsync`** if durability ever matters.
- Cancel endpoint + "running in background" indicator.
- Crash-resume from a `.inprogress.md` (parse existing sections, dedupe ranges).
- Cloud-provider adapter behind the same `ollama.ts` interface.
- **Cache expiry** — evict stale cache entries (review item #3); currently cache hits are
  permanent until `MODEL_VERSION` is bumped manually.
- **Adjacent-summary similarity** — use the previous chunk's summary as context only when
  it is related (review item #5); currently carry-forward is unconditional after the
  `isUsableSummary` gate.
- **Run-stats logging** — log per-run counters (chunks, tokens, per-phase ms, cache hit)
  (review item #7); currently only jobProgress telemetry exists.

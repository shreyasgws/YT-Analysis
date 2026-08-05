# YT Transcript — App Summary

*A fast, full-featured YouTube transcript viewer with local, private AI summarization. Paste a link, read or export the entire captions of any video — even 8-hour videos — in seconds, then generate timestamped, sectioned study notes with your own Ollama model. Nothing leaves your machine.*

---

## What it does

YT Transcript turns any YouTube video into a clean, readable transcript that you can browse, search, copy, and download. It pulls every caption track YouTube offers (manual and auto-generated), in every available language, and renders it instantly — no matter how long the video is.

Then it goes one step further: with one click, a local AI model (Ollama) summarizes the transcript into **timestamped, sectioned study notes** with an overview and key takeaways — generated privately on your own machine, for free.

---

## Feature tour

### 1. Instant transcript for any video
Paste a full URL, a `youtu.be` short link, a `Shorts`/`embed`/`live` link, or a bare 11-character ID. The app resolves it, loads the video metadata, and shows the transcript in under a second.

### 2. Readable by design
Raw subtitles are 2–5 second fragments. YT Transcript merges them into natural paragraphs using smart heuristics: it groups lines until a sentence is complete (min ~12s), never lets a paragraph exceed ~20s, and breaks when there's a natural pause. The result reads like a document, not a caption dump.

### 3. Handles videos of any length
Transcripts of long videos (podcasts, lectures, streams) can contain 20,000+ subtitle segments. The viewer uses windowed rendering (`@tanstack/react-virtual`) so only the lines on screen are in the DOM. **The DOM stays small and the UI stays at 60fps whether the video is 5 minutes or 5 hours.**

### 4. Multi-language captions
Every caption track on the video is listed in a searchable language picker. Manual (human-made) captions are preferred over auto-generated ones. English is selected automatically when it exists; otherwise the first available language loads and the app tells you why.

### 5. Search that works
Type anywhere (press `/`), and search scans the *entire* transcript — not just the visible window. Jump between matches with `Enter` / `Shift+Enter`; each match is scrolled to center and highlighted. `Esc` clears the search.

### 6. Copy & export everything
- **Copy** — with timestamps, without timestamps, or just the text you've selected.
- **Download** in **TXT, Markdown, JSON, SRT, or WebVTT**.
- Timestamps are millisecond-accurate (SRT/VTT are ready for video editors; Markdown is clean for notes).
- Files are named automatically: `Title_[videoId].ext`.

### 7. Local AI summarization (Phase 1.2 — done)
The **AI Summary** panel is a sibling card to the Transcript. One click starts a pipeline that:
- groups the transcript into natural paragraphs, then **chunks it** (~8000 chars) for independent summarization;
- summarizes each chunk with a local model (`qwen3.5:4b` via **Ollama**), with a paragraph overlap and the previous section's summary carried forward for continuity;
- runs a final **reduce pass** that writes a one-paragraph **overview** and **key takeaways**;
- emits timestamped `## [mm:ss] Section` headings — each one is **clickable and jumps the transcript to that moment**.

Generation is **deterministic** (temperature 0, JSON mode) and **cached by content hash**, so re-running the same video+language is instant and reproducible. Results are also saved as Markdown files in `backend/summaries/`, and the active job survives a page refresh (`localStorage`).

### 8. Polished, premium UI
Two equal content cards — the **AI Summary** in cyan and the **Transcript** in green — on a cyan-tinted shell. Both are collapsible from their headers (chevron + title) and share identical styling: rounded corners, accent borders, soft glow, thin per-panel scrollbars. Collapsing the transcript preserves your scroll position, search results, and virtualization state. Completed by a subtle centered footer signature, "Developed by ShreyasGWS".

### 9. Polished UX
Loading skeletons, toast feedback, clear error states with retry, keyboard-accessible controls, **dark mode**, and `prefers-reduced-motion` support. Language switches are race-safe — no stale or flickering content.

---

## Why it's fast

- **Virtualized rendering** — only visible rows exist in the DOM.
- **Browser `Cache-Control` caching** — transcript/meta/languages are cached by the browser HTTP cache; revisiting a video is instant.
- **Content-hash summary cache** — identical inputs replay instantly, version-invalidated on pipeline/prompt/model bumps.
- **Backend-scraped metadata** — captions enumeration, duration, and publish date are fetched once per video and reused across language switches.
- **Global queue + per-video lock** — concurrent Ollama calls are capped (default 2) so a burst of requests can't thrash a single-user machine.
- **Milestone: verified against a 20,000-segment / 2-hour transcript** — paragraphs grouped in ~7ms, DOM size constant, scroll smooth.

---

## Tech stack

- **Frontend:** React 19 · TypeScript · Vite 8 · TanStack Virtual · react-markdown
- **Backend:** Node.js · Express 4 · TypeScript · `youtube-transcript`
- **AI:** Ollama (`qwen3.5:4b`, local) — JSON mode, temperature 0, chunked + reduce pipeline
- **Linting:** Oxlint

---

## Project layout

```
YT Analysis/
├── backend/        Express API — /api/transcript, /api/video/meta, /api/video/languages,
│                   POST /api/analysis/summarize + GET /api/analysis/progress/:jobId
│                   services/ai/ — ollama client, summarize pipeline, markdown save
├── frontend/       React SPA — viewer UI, search, virtualization, export, summary panel
└── summaries/      (in backend/) generated .md files; cache/ holds content-hash entries
```

---

## How to run

```bash
# Pull the local model once
ollama pull qwen3.5:4b

# Backend  (http://localhost:3001)
cd backend && npm install && npm run dev

# Frontend (http://localhost:5173)
cd frontend && npm install && npm run dev
```

Then open **http://localhost:5173**. AI summarization requires Ollama running (`ollama serve`); transcript viewing works without it.

---

## Roadmap

- **Summary styles** — non-terminal styles (glossary, Q&A, TL;DR) and a style picker.
- **Model selection** — an `LLM_PROVIDER` abstraction with OpenAI-compatible endpoints.
- **Whisper fallback** — transcription for videos that have no captions.
- **Persistence** — saved videos, summary history, and a browse UI.
- **Hardening** — cache GC, unit tests for the parser/sanitizer/validator.

---

## Status

**Live:** full transcript viewer (Phase 1.1) **and** local AI summarization (Phase 1.2). **Next:** summary styles and model selection.

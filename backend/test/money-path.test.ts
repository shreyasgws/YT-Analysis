import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Paragraph } from '../src/types'
import {
  cleanupArtifacts,
  chunkByParagraphs,
  extractJson,
  preprocessParagraphs,
} from '../src/services/ai/summarize'
import { isValidLanguageCode, normalizeVideoId } from '../src/services/youtube'

test('extractJson parses clean strict JSON', () => {
  const out = extractJson(
    JSON.stringify({ title: 'Intro', summary: 'A summary.', overview: 'O.', keyTakeaways: ['a', 'b'] }),
  )
  assert.equal(out?.title, 'Intro')
  assert.equal(out?.summary, 'A summary.')
  assert.deepEqual(out?.keyTakeaways, ['a', 'b'])
})

test('extractJson strips markdown fences', () => {
  const out = extractJson('```json\n{"title":"Intro","summary":"S"}\n```')
  assert.equal(out?.title, 'Intro')
  assert.equal(out?.summary, 'S')
})

test('extractJson tolerates the model errors qwen emits: backslashes, unescaped quotes, literal newlines, duplicated keys', () => {
  const raw = [
    'Here you go:',
    '{',
    '"title": "Linear \\regression",', // raw backslash
    '"summary": "He said "hi" then \\n new line",', // unescaped quotes + literal \n
    '"summary": "duplicate should be ignored",', // first key wins
    '}',
    'trailing noise',
  ].join('\n')
  const out = extractJson(raw)
  assert.equal(out?.title, 'Linear regression')
  assert.equal(out?.summary, 'He said "hi" then \n new line')
})

test('extractJson scans keyTakeaways arrays', () => {
  const out = extractJson('{"title":"T","keyTakeaways":["first","second \\"escaped\\""]}')
  assert.equal(out?.title, 'T')
  assert.deepEqual(out?.keyTakeaways, ['first', 'second "escaped"'])
})

test('extractJson returns null on garbage without an object', () => {
  assert.equal(extractJson('the model failed entirely'), null)
  assert.equal(extractJson(''), null)
})

test('preprocessParagraphs merges fragments and drops adjacent duplicates', () => {
  const paras: Paragraph[] = [
    { startMs: 0, endMs: 1000, text: 'The speaker discusses.' },
    { startMs: 1000, endMs: 2000, text: 'key ideas' }, // fragment (<4 words, no period) → appended
    { startMs: 2000, endMs: 3000, text: 'The speaker discusses. key ideas' }, // duplicate
  ]
  const out = preprocessParagraphs(paras)
  assert.equal(out.length, 1)
  assert.equal(out[0].text, 'The speaker discusses. key ideas')
  assert.equal(out[0].endMs, 2000)
})

test('chunkByParagraphs respects the size cap and carries overlap context', () => {
  const paras: Paragraph[] = [
    { startMs: 0, endMs: 1, text: 'a'.repeat(10) },
    { startMs: 1, endMs: 2, text: 'b'.repeat(10) },
    { startMs: 2, endMs: 3, text: 'c'.repeat(10) },
  ]
  const chunks = chunkByParagraphs(paras, 20)
  assert.equal(chunks.length, 2)
  assert.equal(chunks[0].content.length, 2)
  assert.equal(chunks[1].content.length, 1)
  assert.equal(chunks[1].context?.text, 'b'.repeat(10))
  assert.equal(chunks[0].context, null)
})

test('cleanupArtifacts fixes doubled quotes, trailing whitespace, and newline runs', () => {
  assert.equal(cleanupArtifacts('say ""hi""  \n\n\n\nend'), 'say "hi"\n\nend')
})

test('normalizeVideoId handles raw ids and URL forms', () => {
  const id = 'dQw4w9WgXcQ'
  assert.equal(normalizeVideoId(id), id)
  assert.equal(normalizeVideoId(`https://www.youtube.com/watch?v=${id}`), id)
  assert.equal(normalizeVideoId(`https://youtu.be/${id}`), id)
  assert.equal(normalizeVideoId('https://example.com/not-youtube'), null)
  assert.equal(normalizeVideoId(''), null)
})

test('isValidLanguageCode accepts codes and rejects junk', () => {
  assert.equal(isValidLanguageCode('en'), true)
  assert.equal(isValidLanguageCode('en-US'), true)
  assert.equal(isValidLanguageCode('pt-BR'), true)
  assert.equal(isValidLanguageCode('e'), false)
  assert.equal(isValidLanguageCode(''), false)
})

export const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen3.5:4b'
export const OLLAMA_TIMEOUT_MS = 180_000

export interface ChatMessage {
  role: string
  content: string
}

export interface ChatOptions {
  numCtx: number
  numPredict: number
}

export interface ChatResult {
  content: string
  truncated: boolean
}

export class OllamaUnavailableError extends Error {}

export async function chat(
  messages: ChatMessage[],
  opts: ChatOptions,
): Promise<ChatResult> {
  let res: Response
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        think: false,
        format: 'json',
        temperature: 0,
        options: {
          num_ctx: opts.numCtx,
          num_predict: opts.numPredict,
        },
      }),
    })
  } catch (err) {
    throw new OllamaUnavailableError(
      `Ollama unreachable at ${OLLAMA_URL}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new OllamaUnavailableError(`Ollama HTTP ${res.status}: ${text.slice(0, 300)}`)
  }

  const data = (await res.json()) as { message?: { content?: string }; done_reason?: string }
  return {
    content: data.message?.content ?? '',
    truncated: data.done_reason === 'length',
  }
}

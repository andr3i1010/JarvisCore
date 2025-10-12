type CallSettings = {
  maxOutputTokens?: number
  temperature?: number
  topP?: number
  topK?: number
  stopSequences?: string[]
  abortSignal?: AbortSignal
  headers?: Record<string, string>
}

/**
 * Minimal Cloudflare Workers AI provider factory.
 *
 * NOTE: Cloudflare's Workers AI REST API shapes/URLs may change. This file
 * implements a small, configurable adapter that POSTs generation requests to
 * a base URL and supports streaming by consuming the response body as a stream.
 *
 * Environment variables / options expected:
 * - CLOUDFLARE_WORKERS_AI_BASE_URL: base URL for the REST API (e.g. https://api.workers.ai)
 * - CLOUDFLARE_WORKERS_AI_KEY: API key/header value to send as `Authorization: Bearer <key>`
 *
 * The returned object is callable: `const provider = createCloudflareWorkersAI(opts); const model = provider('my-model')`.
 */
export function createCloudflareWorkersAI(options?: { baseURL?: string; apiKey?: string; fetch?: typeof fetch }) {
  const baseURL = options?.baseURL || process.env.CLOUDFLARE_WORKERS_AI_BASE_URL
  const apiKey = options?.apiKey || process.env.CLOUDFLARE_WORKERS_AI_KEY
  const fetchImpl = options?.fetch || fetch

  if (!baseURL) {
    throw new Error("CLOUDFLARE_WORKERS_AI_BASE_URL not provided")
  }

  const base = baseURL!

  function makeUrl(modelId: string) {
    // Keep this generic: the user should point baseURL to the appropriate
    // Cloudflare Workers AI REST endpoint. We'll append /models/:modelId/generate
    return `${base.replace(/\/$/, "")}/models/${encodeURIComponent(modelId)}/generate`
  }

  class CfLanguageModel {
    specificationVersion = "v2" as const
    constructor(public modelId: string) { }

    get provider() {
      return "cloudflare-workers-ai"
    }

    async doGenerate(opts: { prompt?: string; messages?: any[]; callSettings?: CallSettings }) {
      const url = makeUrl(this.modelId)
      const body: any = {}
      if (opts.prompt) body.prompt = opts.prompt
      if (opts.messages) body.messages = opts.messages
      if (opts.callSettings) body.callSettings = opts.callSettings

      const res = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: opts.callSettings?.abortSignal,
      })

      if (!res.ok) {
        const txt = await res.text().catch(() => "")
        throw new Error(`Cloudflare Workers AI API error: ${res.status} ${res.statusText} - ${txt}`)
      }

      // Try to parse streaming JSONL or newline-delimited chunks. If response
      // is a single JSON object, return its text content.
      const contentType = res.headers.get("content-type") || ""
      if (contentType.includes("stream") || contentType.includes("event-stream") || contentType.includes("jsonl") || !!res.body) {
        // Fallback: read entire body as text and parse if needed.
        const text = await res.text()
        // Attempt to parse JSON
        try {
          const parsed = JSON.parse(text)
          return {
            text: (parsed?.text ?? parsed?.output ?? parsed?.result ?? "") as string,
            metadata: { id: parsed?.id ?? "", modelId: this.modelId },
          }
        } catch (e) {
          return { text, metadata: { id: "", modelId: this.modelId } }
        }
      }

      const text = await res.text()
      return { text, metadata: { id: "", modelId: this.modelId } }
    }

    async doStream(opts: { prompt?: string; messages?: any[]; callSettings?: CallSettings }) {
      const url = makeUrl(this.modelId)
      const body: any = {}
      if (opts.prompt) body.prompt = opts.prompt
      if (opts.messages) body.messages = opts.messages
      if (opts.callSettings) body.callSettings = opts.callSettings

      const res = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: opts.callSettings?.abortSignal,
      })

      if (!res.ok) {
        const txt = await res.text().catch(() => "")
        throw new Error(`Cloudflare Workers AI API error: ${res.status} ${res.statusText} - ${txt}`)
      }

      const reader = res.body && typeof res.body.getReader === "function" ? res.body.getReader() : undefined
      if (!reader) {
        // No streaming support; read whole body and yield once.
        const text = await res.text()
        async function* single() {
          yield text
        }
        return {
          textStream: single(),
          metadata: { id: "", modelId: this.modelId },
        }
      }

      // Create an async generator that yields text chunks
      async function* streamGenerator(this: CfLanguageModel) {
        if (!reader) return
        const decoder = new TextDecoder()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (value) {
              yield decoder.decode(value, { stream: true })
            }
          }
        } finally {
          try {
            if (typeof reader.cancel === "function") await reader.cancel()
          } catch (_) {
            // ignore
          }
        }
      }

      return {
        textStream: streamGenerator.call(this),
        metadata: { id: "", modelId: this.modelId },
      }
    }
  }

  const factory = (modelId: string) => new CfLanguageModel(modelId)

    // Attach convenience method used by some callers
    ; (factory as any).languageModel = (modelId: string) => new CfLanguageModel(modelId)

  return factory as unknown as (modelId: string) => any
}

export default createCloudflareWorkersAI
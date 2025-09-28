import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOllama } from "ollama-ai-provider-v2"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { type LanguageModel } from "ai"

let provider:
  | ReturnType<typeof createOpenAI>
  | ReturnType<typeof createAnthropic>
  | ReturnType<typeof createGoogleGenerativeAI>
  | ReturnType<typeof createOllama>
  | ReturnType<typeof createOpenRouter>
  | null = null

export const initAIProvider = (providerName: string) => {
  switch (providerName) {
    case "openai":
      provider = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY!,
      })
      break
    case "anthropic":
      provider = createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY!,
      })
      break
    case "google":
      provider = createGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_API_KEY!,
      })
      break
    case "ollama":
      provider = createOllama({
        baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      })
      break
    case "openrouter":
      provider = createOpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY!,
      })
      break
    default:
      throw new Error(`Unsupported AI provider: ${providerName}`)
  }
}


export const AI = (model: string): LanguageModel => {
  if (!provider) {
    throw new Error("AI provider not initialized. Call initAIProvider() first.")
  }
  return provider(model)
}

import { AIProviderFunctions } from "../../types";

export function getAIProvider(provider: string): AIProviderFunctions {
  switch (provider) {
    case "openai":
      const { OpenAIProvider } = require("./openai/openai");
      return new OpenAIProvider({
        apiKey: process.env.API_KEY || "",
        model: process.env.MODEL || "gpt-3.5-turbo",
        temperature: Number(process.env.TEMPERATURE) || 0.7,
        baseUrl: process.env.BASE_URL || undefined,
      });
    case "anthropic":
      const { AnthropicProvider } = require("./anthropic/anthropic");
      return new AnthropicProvider({
        apiKey: process.env.API_KEY || "",
        model: process.env.MODEL || "claude-sonnet-4-5",
        baseUrl: process.env.BASE_URL || undefined,
      });
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}
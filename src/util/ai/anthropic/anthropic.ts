import { AIResponsePacket } from "../../../types";
import { AnthropicProviderConfig } from "./anthropic.types";
import Anthropic from "@anthropic-ai/sdk";

export class AnthropicProvider {
  private config: AnthropicProviderConfig;
  private AnthropicClient: Anthropic;
  constructor(config: AnthropicProviderConfig) {
    this.config = config;
    this.AnthropicClient = new Anthropic({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
    });
  }

  async *streamChat(messages: Anthropic.Messages.MessageParam[], options?: Record<string, any>): AsyncGenerator<AIResponsePacket> {
    const stream = await this.AnthropicClient.messages.stream({
      model: this.config.model,
      messages,
      max_tokens: options?.max_tokens ?? 4096,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield { ok: true, event: 'ai.chunk', content: chunk.delta.text };
      }
    }
    yield { ok: true, event: 'ai.done' };
  }
}
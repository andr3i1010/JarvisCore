import { AIResponsePacket } from "../../../types";
import { AnthropicProviderConfig } from "./anthropic.types";

export class AnthropicProvider {
  private config: AnthropicProviderConfig;
  constructor(config: AnthropicProviderConfig) {
    this.config = config;
  }

  async *streamChat(messages: Object[], options?: Record<string, any>): AsyncGenerator<AIResponsePacket> {
    const resp = await fetch(`${this.config.baseUrl || "https://api.anthropic.com"}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.config.apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 1024,
        stream: true,
        messages
      })
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      yield {
        ok: false,
        event: "ai.error",
        error: `Anthropic API error: ${errorText}`,
      };
      return;
    }

    const reader = resp.body?.getReader();
    if (!reader) {
      throw new Error("Failed to get reader from response body");
    }

    const decoder = new TextDecoder("utf-8");
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);

            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              yield {
                ok: true,
                event: "ai.stream",
                content: event.delta.text
              };
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }
    }
    yield {
      ok: true,
      event: "ai.done"
    };
  }
}
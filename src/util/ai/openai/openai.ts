import { AIResponsePacket } from "../../../types";
import { OpenAIProviderConfig } from "./openai.types";

export class OpenAIProvider {
  private config: OpenAIProviderConfig;

  constructor(config: OpenAIProviderConfig) {
    this.config = config;
  }

  async *streamChat(messages: Array<{ role: string; content: string }>): AsyncGenerator<AIResponsePacket> {
    try {
      const resp = await fetch(`${this.config.baseUrl || 'https://api.openai.com/v1'}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          temperature: this.config.temperature || 0.7,
          stream: true,
        }),
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        yield {
          ok: false,
          event: "ai.error",
          error: `OpenAI API error: ${errorText}`,
        };
        return;
      }

      const reader = resp.body?.getReader();

      if (!reader) {
        throw new Error("Failed to get reader from response body");
      }
      
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                yield {
                  ok: true,
                  event: 'ai.done'
                };
                return;
              }
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices[0]?.delta?.content;
                if (content) {
                  yield {
                    ok: true,
                    event: 'ai.stream',
                    content
                   };
                }
              } catch (e) {
                yield {
                  ok: false,
                  event: 'ai.error',
                  error: `Failed to parse OpenAI stream data: ${e}`
                };
              }
            }
          }
        }
      }
    } catch (e) {
      yield {
        ok: false,
        event: 'ai.error',
        error: `Stream error: ${e}`
      };
    }
  }

  async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
    const resp = await fetch(`${this.config.baseUrl || 'https://api.openai.com/v1'}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: this.config.temperature || 0.7,
      }),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const data = await resp.json();
    return data.choices[0]?.message?.content || '';
  }

  async completions(prompt: string): Promise<string> {
    const resp = await fetch(`${this.config.baseUrl || 'https://api.openai.com/v1'}/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        prompt,
        temperature: this.config.temperature || 0.7,
        max_tokens: 150,
      }),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const data = await resp.json();
    return data.choices[0]?.text || '';
  }
}
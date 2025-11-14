import { AIResponsePacket } from "../../../types";
import { OpenAIProviderConfig } from "./openai.types";
import OpenAI from "openai";

export class OpenAIProvider {
  private config: OpenAIProviderConfig;
  private OAIClient: OpenAI;

  constructor(config: OpenAIProviderConfig) {
    this.config = config;
    this.OAIClient = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
    });
  }

  async *streamChat(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): AsyncGenerator<AIResponsePacket> {
    const stream = await this.OAIClient.chat.completions.create({
      model: this.config.model,
      messages,
      temperature: this.config.temperature || 1,
      stream: true,
      reasoning_effort: 'medium'
    })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield { ok: true, event: 'ai.chunk', content };
      }
    }
    yield { ok: true, event: 'ai.done' };
  }

  async chat(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<AIResponsePacket> {
    const stream = await this.OAIClient.chat.completions.create({
      model: this.config.model,
      messages,
      temperature: this.config.temperature || 1,
      stream: false,
      reasoning_effort: 'medium'
    })

    return { ok: true, event: 'ai.complete', content: stream.choices[0]?.message?.content || '' };
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
        temperature: this.config.temperature || 1,
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
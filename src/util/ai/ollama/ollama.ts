import { Ollama } from 'ollama'
import { AIResponsePacket } from '../../../types';

export class OllamaProvider {
  private OllamaClient: Ollama;
  constructor(options: { model: string; baseUrl?: string }) {
    this.OllamaClient = new Ollama({
      host: options.baseUrl || 'http://localhost:11434',
    })
  }

  async *streamChat(messages: any[], options?: Record<string, any>): AsyncGenerator<any> {
    const resp = await this.OllamaClient.chat({
      model: options?.model || 'mistral:7b-instruct',
      messages,
      stream: true,
    })

    for await (const chunk of resp) {
      yield { ok: true, event: 'ai.stream', content: chunk.message }
    }
  }

  async chat(messages: any[], options?: Record<string, any>): Promise<AIResponsePacket> {
    const resp = await this.OllamaClient.chat({
      model: options?.model || 'mistral:7b-instruct',
      messages,
      stream: false,
    })
    return { ok: true, event: 'ai.done', content: resp.message.content }
  }
}
import WebSocket from "ws";
import type { AIProviderFunctions, ModuleObject } from "../types";
import { processAIStreamWithTools } from "./toolExecutor";

export async function handleAIChat(
  client: WebSocket,
  aiProvider: AIProviderFunctions,
  modules: ModuleObject[],
  messages: any[]
): Promise<void> {
  try {
    await processAIStreamWithTools(aiProvider, modules, messages, {
      onContent: (content) => {
        if (content.trim()) {
          client.send(JSON.stringify({ ok: true, event: "ai.stream", content }));
        }
      },
      onToolStart: (cmd) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ ok: true, event: "ai.tool", tool: cmd }));
        }
      },
    });
    client.send(JSON.stringify({ ok: true, event: "ai.done" }));
  } catch (err: any) {
    client.send(JSON.stringify({ ok: false, event: "ai.error", output: err?.message || String(err) }));
  }
}

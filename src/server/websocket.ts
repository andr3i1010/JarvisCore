import { WebSocketServer, WebSocket } from "ws";
import { log } from "../util/logger";
import { getStoreValue } from "../util/dataStore";
import { handleAIChat } from "../util/aiChat";
import type { ModuleObject, AIProviderFunctions } from "../types";

interface WebSocketConfig {
  port: number;
  aiProvider: AIProviderFunctions;
  modules: ModuleObject[];
}

export function startWebSocketServer({ port, aiProvider, modules }: WebSocketConfig): WebSocketServer {
  const wss = new WebSocketServer({ port });
  log("info", `WebSocket server started on port ${port}`);

  wss.on("connection", (client: WebSocket & { messages?: any[] }) => {
    const systemContent = getStoreValue("system_prompt") as string;
    client.messages = [{ role: "system", content: systemContent }];

    client.on("message", (data) => handleMessage(client, data, aiProvider, modules));
  });

  return wss;
}

function handleMessage(
  client: WebSocket & { messages?: any[] },
  data: any,
  aiProvider: AIProviderFunctions,
  modules: ModuleObject[]
): void {
  const parsed = parseCommand(data);
  if (!parsed.ok) {
    sendError(client, parsed.error!);
    return;
  }

  const { namespace, action, payload } = parsed;

  if (namespace === "ai" && action === "chat") {
    const prompt = payload.prompt;
    if (!prompt || typeof prompt !== "string") {
      client.send(JSON.stringify({ ok: false, event: "ai.error", output: "No valid prompt provided" }));
      return;
    }
    client.messages = client.messages || [];
    client.messages.push({ role: "user", content: prompt });
    handleAIChat(client as any, aiProvider, modules, client.messages);
    return;
  }

  sendError(client, "Direct tool/module invocation is reserved for the AI. Clients may only call 'jc' commands or 'ai.chat'.");
}

interface ParseResult {
  ok: boolean;
  namespace?: string;
  action?: string;
  payload?: any;
  error?: string;
}

function parseCommand(data: any): ParseResult {
  let parsed: any;
  try {
    parsed = JSON.parse(data.toString());
  } catch {
    return { ok: false, error: "Invalid JSON in message" };
  }

  if (!parsed || typeof parsed !== "object" || typeof parsed.cmd !== "string") {
    return { ok: false, error: "Invalid command format. Expected { cmd: string, ... }" };
  }

  const parts = parsed.cmd.split(".");
  if (parts.length < 2) {
    return { ok: false, error: "Invalid command name. Expected format '<namespace>.<action>'" };
  }

  return {
    ok: true,
    namespace: parts[0],
    action: parts[1],
    payload: parsed,
  };
}

function sendError(client: WebSocket, message: string): void {
  client.send(JSON.stringify({ ok: false, event: "error", output: message }));
}

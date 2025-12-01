import http from "http";
import url from "url";
import { log } from "../util/logger";
import { getStoreValue } from "../util/dataStore";
import { processAIStreamWithTools } from "../util/toolExecutor";
import type { AIProviderFunctions, ModuleObject } from "../types";

interface OpenAICompatConfig {
  port: number;
  aiProvider: AIProviderFunctions;
}

export function startOpenAICompatServer({ port, aiProvider }: OpenAICompatConfig): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      const parsed = url.parse(req.url || "", true);
      const body = await readBody(req);
      const json = body ? JSON.parse(body) : {};

      const handler = getRouteHandler(req.method || "", parsed.pathname || "");
      await handler(res, json, aiProvider);
    } catch (err: any) {
      sendError(res, 500, err?.message || String(err));
    }
  });

  server.listen(port, () => {
    log("info", `OpenAI-compatible HTTP server started on port ${port}`);
  });

  return server;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
  });
}

type RouteHandler = (res: http.ServerResponse, json: any, ai: AIProviderFunctions) => Promise<void>;

function getRouteHandler(method: string, pathname: string): RouteHandler {
  if (method === "GET" && pathname === "/") return handleHealth;
  if (method === "GET" && pathname === "/v1/models") return handleListModels;
  if (method === "POST" && pathname === "/v1/chat/completions") return handleChatCompletions;
  if (method === "POST" && pathname === "/v1/completions") return handleCompletions;
  return handleNotFound;
}

async function handleHealth(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, { ok: true });
}

async function handleListModels(res: http.ServerResponse): Promise<void> {
  const modelName = process.env.MODEL || "gpt-5";
  sendJson(res, 200, { object: "list", data: [{ id: modelName, object: "model" }] });
}

async function handleChatCompletions(res: http.ServerResponse, json: any, ai: AIProviderFunctions): Promise<void> {
  const { messages = [], model, stream } = json;
  const modules = (getStoreValue("modules") as ModuleObject[]) || [];
  const systemPrompt = getStoreValue("system_prompt") as string;

  // Prepend system prompt if not already present
  const messagesWithSystem = messages[0]?.role === "system"
    ? messages
    : [{ role: "system", content: systemPrompt }, ...messages];

  if (stream) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    try {
      await processAIStreamWithTools(ai, modules, [...messagesWithSystem], {
        onContent: (content) => {
          const payload = { choices: [{ delta: { content } }] };
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        },
      });
      res.write("data: [DONE]\n\n");
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ error: err?.message || String(err) })}\n\n`);
    }
    res.end();
    return;
  }

  try {
    let fullContent = "";
    await processAIStreamWithTools(ai, modules, [...messagesWithSystem], {
      onContent: (content) => { fullContent += content; },
    });

    sendJson(res, 200, {
      id: `jc-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model || process.env.MODEL || "gpt-5",
      choices: [{ index: 0, message: { role: "assistant", content: fullContent }, finish_reason: "stop" }],
    });
  } catch (err: any) {
    sendError(res, 500, err?.message || String(err));
  }
}

async function handleCompletions(res: http.ServerResponse, json: any, ai: AIProviderFunctions): Promise<void> {
  try {
    const text = await ai.completions(json?.prompt || "");
    sendJson(res, 200, {
      id: `jc-${Date.now()}`,
      object: "text_completion",
      created: Math.floor(Date.now() / 1000),
      model: process.env.MODEL || "gpt-5",
      choices: [{ text, index: 0, finish_reason: "stop" }],
    });
  } catch (err: any) {
    sendError(res, 500, err?.message || String(err));
  }
}

async function handleNotFound(res: http.ServerResponse): Promise<void> {
  sendJson(res, 404, { error: "not_found" });
}

function sendJson(res: http.ServerResponse, status: number, data: any): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  try {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  } catch { }
}

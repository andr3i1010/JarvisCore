import { log } from "./logger";
import type { ToolCallRequest, ModuleObject, AIProviderFunctions } from "../types";

type DetectedToolCall = ToolCallRequest & { _raw: string; _start: number; _end: number };

export function detectToolCalls(text: string): DetectedToolCall[] {
  const toolCalls: DetectedToolCall[] = [];
  const len = text.length;
  let i = 0;

  while (i < len) {
    if (text[i] === "{") {
      let inString = false, escape = false, depth = 0;
      for (let j = i; j < len; j++) {
        const ch = text[j];
        if (escape) { escape = false; continue; }
        if (ch === "\\") { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;

        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            const candidate = text.slice(i, j + 1);
            try {
              const parsed = JSON.parse(candidate);
              if (parsed?.cmd && parsed.payload !== undefined) {
                toolCalls.push({ ...parsed, _raw: candidate, _start: i, _end: j + 1 });
              }
            } catch { }
            i = j;
            break;
          }
        }
      }
    }
    i++;
  }
  return toolCalls;
}

export function isToolCallAtEnd(fullContent: string, tc: { _end: number }): boolean {
  const trailing = fullContent.slice(tc._end);
  return trailing.trim().length === 0 || /^[`~\s]*$/.test(trailing);
}

export function stripToolCallsFromContent(content: string, toolCalls: DetectedToolCall[]): string {
  // Remove server-executable tool calls (passToClient !== true) from content
  let result = content;
  for (const tc of toolCalls.filter(t => !t.passToClient && isToolCallAtEnd(content, t))) {
    result = result.replace(tc._raw, "");
  }
  return result.trim();
}

export async function executeToolCall(toolCall: ToolCallRequest, modules: ModuleObject[]): Promise<any> {
  const mod = modules.find((m) => m.name === toolCall.cmd);
  if (!mod) throw new Error(`Module not found: ${toolCall.cmd}`);
  if (typeof mod.execute !== "function") throw new Error(`Module ${toolCall.cmd} has no execute method`);
  return mod.execute(toolCall.payload);
}

export interface ToolResult {
  cmd: string;
  result: any;
  error: string | null;
}

export async function executeServerToolCalls(
  toolCalls: DetectedToolCall[],
  modules: ModuleObject[],
  onToolStart?: (cmd: string) => void
): Promise<ToolResult[]> {
  const serverExecutable = toolCalls.filter((tc) => !tc.passToClient);
  if (serverExecutable.length === 0) return [];

  return Promise.all(
    serverExecutable.map(async (tc) => {
      try {
        onToolStart?.(tc.cmd);
        const result = await executeToolCall(tc, modules);
        log("info", `Tool execution result for ${tc.cmd}: ${JSON.stringify(result)}`);
        return { cmd: tc.cmd, result, error: null };
      } catch (err: any) {
        log("error", `Tool execution failed for ${tc.cmd}: ${err?.message || String(err)}`);
        return { cmd: tc.cmd, result: null, error: err?.message || String(err) };
      }
    })
  );
}

export function formatToolResults(results: ToolResult[]): string {
  return results
    .map((r) => (r.error ? `${r.cmd} failed: ${r.error}` : `${r.cmd} result: ${JSON.stringify(r.result)}`))
    .join("\n");
}

export interface StreamCallbacks {
  onContent: (content: string) => void;
  onToolStart?: (cmd: string) => void;
}

export async function processAIStreamWithTools(
  aiProvider: AIProviderFunctions,
  modules: ModuleObject[],
  messages: any[],
  callbacks: StreamCallbacks
): Promise<{ finalContent: string; toolResults: ToolResult[] }> {
  let fullContent = "";

  // First pass: stream content
  for await (const packet of aiProvider.streamChat(messages, {})) {
    if (packet.content) {
      fullContent += packet.content;
      callbacks.onContent(packet.content);
    }
  }

  const detectedCalls = detectToolCalls(fullContent);
  const toolCallAtEnd = detectedCalls.find((tc) => isToolCallAtEnd(fullContent, tc));

  if (!toolCallAtEnd) {
    return { finalContent: fullContent, toolResults: [] };
  }

  // Execute server-side tool calls
  const toolResults = await executeServerToolCalls(detectedCalls, modules, callbacks.onToolStart);

  if (toolResults.length === 0) {
    return { finalContent: fullContent, toolResults: [] };
  }

  // Add tool results and get explanation
  const strippedContent = stripToolCallsFromContent(fullContent, detectedCalls);
  messages.push({ role: "assistant", content: fullContent });
  messages.push({
    role: "system",
    content: `TOOL RESULT:\n${formatToolResults(toolResults)}`,
  });

  // Stream explanation
  for await (const packet of aiProvider.streamChat(messages, {})) {
    if (packet.content) {
      callbacks.onContent(packet.content);
    }
  }

  return { finalContent: strippedContent, toolResults };
}

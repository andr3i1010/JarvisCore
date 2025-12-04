import { log } from "./logger";
import type { ModuleObject, AIProviderFunctions } from "../types";
import { detectToolCalls, stripToolCalls, getServerToolCalls } from "./toolParser";
import { executeToolCalls, createToolResultMessage } from "./toolRunner";
import { createLineBuffer, processChunk, flushBuffer } from "./streamBuffer";

export type { ToolResult } from "./toolRunner";
export { formatToolResults } from "./toolRunner";

export interface StreamCallbacks {
  onContent: (content: string) => void;
  onToolStart?: (cmd: string) => void;
}

/**
 * Process an AI stream with automatic tool detection, execution, and response generation.
 * When a tool call is detected mid-stream, stops output and executes the tool.
 */
export async function processAIStreamWithTools(
  aiProvider: AIProviderFunctions,
  modules: ModuleObject[],
  messages: any[],
  callbacks: StreamCallbacks
): Promise<void> {
  let state = createLineBuffer();

  // Stream content line-by-line, filtering tool calls
  for await (const packet of aiProvider.streamChat(messages, {})) {
    if (packet.content) {
      const result = processChunk(state, packet.content);
      state = result.state;
      for (const line of result.lines) {
        callbacks.onContent(line);
      }
    }
  }

  // Flush remaining buffer
  const remaining = flushBuffer(state);
  if (remaining) callbacks.onContent(remaining);

  // Detect and execute tool calls
  const serverCalls = getServerToolCalls(detectToolCalls(state.fullContent));
  if (serverCalls.length === 0) return;

  log("info", `Executing ${serverCalls.length} tool(s)`);
  const toolResults = await executeToolCalls(serverCalls, modules, callbacks.onToolStart);
  if (toolResults.length === 0) return;

  // Build assistant content for context
  const assistantContent = state.toolCallDetected
    ? state.contentBeforeToolCall + "\n" + serverCalls[0]._raw
    : state.fullContent;

  // Send tool results back to AI for explanation
  messages.push({ role: "assistant", content: assistantContent });
  messages.push(createToolResultMessage(toolResults));

  // Stream the explanation
  for await (const packet of aiProvider.streamChat(messages, {})) {
    if (packet.content) callbacks.onContent(packet.content);
  }
}

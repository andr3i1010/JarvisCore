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
 * Loops until no more tool calls are detected (supports chained tool calls).
 */
export async function processAIStreamWithTools(
  aiProvider: AIProviderFunctions,
  modules: ModuleObject[],
  messages: any[],
  callbacks: StreamCallbacks,
  maxIterations: number = 10
): Promise<void> {
  for (let iteration = 0; iteration < maxIterations; iteration++) {
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
    if (serverCalls.length === 0) {
      // No more tool calls - we're done
      return;
    }

    log("info", `Executing ${serverCalls.length} tool(s) (iteration ${iteration + 1})`);
    const toolResults = await executeToolCalls(serverCalls, modules, callbacks.onToolStart);
    if (toolResults.length === 0) return;

    // Build assistant content for context
    const assistantContent = state.toolCallDetected
      ? state.contentBeforeToolCall + "\n" + serverCalls[0]._raw
      : state.fullContent;

    // Send tool results back to AI and loop to check for more tool calls
    messages.push({ role: "assistant", content: assistantContent });
    messages.push(createToolResultMessage(toolResults));
  }

  log("warn", `Max tool iterations (${maxIterations}) reached`);
}
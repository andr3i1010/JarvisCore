import { looksLikeToolCall } from "./toolParser";

export interface LineBuffer {
  buffer: string;
  fullContent: string;
  toolCallDetected: boolean;
  contentBeforeToolCall: string;
}

export function createLineBuffer(): LineBuffer {
  return { buffer: "", fullContent: "", toolCallDetected: false, contentBeforeToolCall: "" };
}

/**
 * Process chunk, returning lines safe to emit. Stops output when tool call detected.
 */
export function processChunk(
  state: LineBuffer,
  chunk: string
): { lines: string[]; state: LineBuffer } {
  state.fullContent += chunk;
  if (state.toolCallDetected) return { lines: [], state };

  state.buffer += chunk;
  const lines: string[] = [];
  let idx = state.buffer.indexOf("\n");

  while (idx !== -1) {
    const line = state.buffer.slice(0, idx + 1);
    state.buffer = state.buffer.slice(idx + 1);

    if (looksLikeToolCall(line)) {
      state.toolCallDetected = true;
      state.contentBeforeToolCall = state.fullContent.slice(0, state.fullContent.indexOf(line.trim()));
      return { lines, state };
    }

    if (line.trim()) lines.push(line);
    idx = state.buffer.indexOf("\n");
  }

  return { lines, state };
}

/**
 * Flush remaining buffer, suppressing tool calls.
 */
export function flushBuffer(state: LineBuffer): string | null {
  if (state.toolCallDetected || !state.buffer.trim()) return null;
  if (looksLikeToolCall(state.buffer)) return null;
  return state.buffer;
}

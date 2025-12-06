import { looksLikeToolCall } from "./toolParser";
import { log } from "./logger";

export interface LineBuffer {
  buffer: string;
  fullContent: string;
  toolCallDetected: boolean;
  contentBeforeToolCall: string;
  pendingToolLine: string | null;
  inCodeBlock: boolean;
}

export function createLineBuffer(): LineBuffer {
  return {
    buffer: "",
    fullContent: "",
    toolCallDetected: false,
    contentBeforeToolCall: "",
    pendingToolLine: null,
    inCodeBlock: false
  };
}

/**
 * Process chunk, returning lines safe to emit.
 * Only marks tool call as detected if it ends up being the last line.
 */
export function processChunk(
  state: LineBuffer,
  chunk: string
): { lines: string[]; state: LineBuffer } {
  if (state.toolCallDetected) return { lines: [], state };
  state.fullContent += chunk;

  state.buffer += chunk;
  const lines: string[] = [];
  let idx = state.buffer.indexOf("\n");

  while (idx !== -1) {
    const line = state.buffer.slice(0, idx + 1);
    state.buffer = state.buffer.slice(idx + 1);

    if (line.trim().startsWith("```")) {
      state.inCodeBlock = !state.inCodeBlock;
    }

    // If we had a pending tool line, it wasn't the last line, so emit it
    if (state.pendingToolLine !== null) {
      if (state.pendingToolLine.trim()) lines.push(state.pendingToolLine);
      state.pendingToolLine = null;
    }

    if (!state.inCodeBlock && looksLikeToolCall(line)) {
      // Detected tool call - stop processing immediately
      state.toolCallDetected = true;
      state.fullContent = state.fullContent.slice(0, state.fullContent.length - state.buffer.length);
      state.contentBeforeToolCall = state.fullContent.slice(0, state.fullContent.length - line.length);
      return { lines, state };
    } else if (line.trim()) {
      lines.push(line);
    }

    idx = state.buffer.indexOf("\n");
  }

  return { lines, state };
}

/**
 * Flush remaining buffer. If the last content is a tool call, mark it as detected.
 */
export function flushBuffer(state: LineBuffer): string | null {
  if (state.toolCallDetected) return null;

  // Check if pending tool line or remaining buffer is a tool call at the end
  const remaining = state.pendingToolLine || state.buffer;

  log("debug", `flushBuffer: pendingToolLine=${JSON.stringify(state.pendingToolLine)}, buffer=${JSON.stringify(state.buffer)}`);
  log("debug", `flushBuffer: remaining=${JSON.stringify(remaining)}, looksLikeToolCall=${looksLikeToolCall(remaining || "")}`);

  if (remaining && looksLikeToolCall(remaining)) {
    // This is a tool call at the very end - mark as detected, don't emit
    state.toolCallDetected = true;
    state.contentBeforeToolCall = state.fullContent.slice(0, state.fullContent.lastIndexOf(remaining.trim()));
    log("debug", `flushBuffer: detected tool call at end`);
    return null;
  }

  // Emit any pending tool line that wasn't actually at the end (more content followed)
  if (state.pendingToolLine !== null) {
    const pending = state.pendingToolLine;
    state.pendingToolLine = null;
    const bufferContent = state.buffer.trim() ? state.buffer : "";
    return (pending + bufferContent).trim() || null;
  }

  if (!state.buffer.trim()) return null;
  return state.buffer;
}

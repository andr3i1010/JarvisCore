import type { ToolCallRequest } from "../types";

export type DetectedToolCall = ToolCallRequest & {
  _raw: string;
  _start: number;
  _end: number;
};

/**
 * Parse and extract tool call JSON objects from text content.
 * Handles nested braces and string escaping properly.
 */
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

/**
 * Check if a single line looks like a tool call JSON.
 */
export function looksLikeToolCall(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed?.cmd && parsed?.payload !== undefined;
  } catch {
    return false;
  }
}

/**
 * Remove server-executable tool calls from content.
 */
export function stripToolCalls(content: string, toolCalls: DetectedToolCall[]): string {
  let result = content;
  for (const tc of toolCalls.filter(t => !t.passToClient)) {
    result = result.replace(tc._raw, "");
  }
  return result.trim();
}

/**
 * Get server-executable tool calls (passToClient !== true).
 */
export function getServerToolCalls(toolCalls: DetectedToolCall[]): DetectedToolCall[] {
  return toolCalls.filter(tc => !tc.passToClient);
}

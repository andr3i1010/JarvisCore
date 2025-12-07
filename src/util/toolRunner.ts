import { log } from "./logger";
import { encode } from "@toon-format/toon";
import type { ToolCallRequest, ModuleObject } from "../types";
import type { DetectedToolCall } from "./toolParser";

export interface ToolResult {
  cmd: string;
  result: any;
  error: string | null;
}

async function executeOne(tc: ToolCallRequest, modules: ModuleObject[]): Promise<any> {
  const mod = modules.find((m) => m.name === tc.cmd);
  if (!mod) throw new Error(`Module not found: ${tc.cmd}`);
  if (typeof mod.execute !== "function") throw new Error(`Module ${tc.cmd} has no execute method`);
  return mod.execute(tc.payload);
}

/**
 * Execute server-side tool calls in parallel.
 */
export async function executeToolCalls(
  toolCalls: DetectedToolCall[],
  modules: ModuleObject[],
  onToolStart?: (cmd: string) => void
): Promise<ToolResult[]> {
  const serverCalls = toolCalls.filter((tc) => !tc.passToClient);
  if (serverCalls.length === 0) return [];

  return Promise.all(
    serverCalls.map(async (tc) => {
      try {
        onToolStart?.(tc.cmd);
        const result = await executeOne(tc, modules);
        log("info", `Tool [${tc.cmd}]: ${JSON.stringify(result).slice(0, 200)}`);
        return { cmd: tc.cmd, result, error: null };
      } catch (err: any) {
        log("error", `Tool [${tc.cmd}] failed: ${err?.message || String(err)}`);
        return { cmd: tc.cmd, result: null, error: err?.message || String(err) };
      }
    })
  );
}

export function formatToolResults(results: ToolResult[]): string {
  // Represent the results as a structured object and encode to TOON for
  // token-efficient, LLM-friendly formatting. Fall back to the previous
  // plain-string format if encoding fails for any reason.
  const payload = {
    tools: results.map((r) => ({ cmd: r.cmd, error: r.error, result: r.result })),
  };

  try {
    return encode(payload);
  } catch (err: any) {
    log("error", `TOON encoding failed: ${err?.message || String(err)}`);
    return results
      .map((r) => (r.error ? `${r.cmd} failed: ${r.error}` : `${r.cmd} result: ${JSON.stringify(r.result)}`))
      .join("\n");
  }
}

export function createToolResultMessage(results: ToolResult[]): { role: string; content: string } {
  const toon = formatToolResults(results);
  // Wrap TOON output in a toon code fence to make the format explicit for LLMs.
  const content = `Here are the tool results:\n\n\`\`\`toon\n${toon}\n\`\`\``;
  return { role: "user", content };
}

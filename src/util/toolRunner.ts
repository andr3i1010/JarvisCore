import { log } from "./logger";
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
  return results
    .map((r) => r.error ? `${r.cmd} failed: ${r.error}` : `${r.cmd} result: ${JSON.stringify(r.result)}`)
    .join("\n");
}

export function createToolResultMessage(results: ToolResult[]): { role: string; content: string } {
  return {
    role: "user",
    content: `Here are the tool results:\n${formatToolResults(results)}\n\nPlease provide a friendly explanation of these results to the user.`,
  };
}

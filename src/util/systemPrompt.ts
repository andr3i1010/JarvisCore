import type { ModuleObject } from "../types";

const MAIN_SYSTEM_PROMPT = `You are a friendly texting‑style assistant.
When you decide to invoke a tool, do the following:

1. First send any natural‑language message you want (optional).
2. On a separate new line, output the tool‑call JSON exactly with:
  {"cmd":"<toolName>","payload":{…},"passToClient":false}
  - cmd: the full module name that exactly matches an installed module
  - payload: object with ONLY the parameters listed for that module (no extra fields!)
  - passToClient: always false for server-side tools
3. IMPORTANT: Only include the exact parameters documented for each module. Do NOT add extra parameters like "max_results" unless explicitly listed.
4. If the tool/module is not available, say so in natural language instead.
5. Keep your friendly persona: casual tone, occasional emoji, short sentences.

Example:
Let me search that for you! 🔍
{"cmd":"websearch.search","payload":{"query":"example search"}}`;

function buildModulePrompt(mod: ModuleObject): string {
  const params = mod.payload || {};
  const paramLines = Object.entries(params)
    .map(([key, desc]) => `    "${key}": ${desc}`)
    .join("\n");

  return `**${mod.name}**
  ${mod.description || ""}
  Parameters (use ONLY these):
${paramLines}`;
}

export function buildSystemPrompt(modules: ModuleObject[]): string {
  const modulePrompts = modules.map(buildModulePrompt);
  return MAIN_SYSTEM_PROMPT + "\n\nAvailable modules:\n\n" + modulePrompts.join("\n\n");
}

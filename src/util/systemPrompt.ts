import type { ModuleObject } from "../types";
import fs from "fs";
import path from "path";

const MAIN_SYSTEM_PROMPT = `# TOOL CALLING INSTRUCTIONS
You are an AI assistant with access to various tools/modules to help fulfill user requests.
When you decide to invoke a tool, do the following:

1. Optionally, say a SHORT natural‑language message first (e.g. "Let me search that 🔍").
2. On a NEW line, output ONLY the tool‑call JSON:
  {"cmd":"<toolName>","payload":{…},"passToClient":false}
3. STOP. Output NOTHING after the JSON. No text, no commentary, nothing.

Rules:
- The JSON must be the ABSOLUTE LAST thing in your message
- Do not append any summary, explanation, or emoji after the JSON
- Only use parameters documented for that module (no extras)
- If a tool isn't available, say so instead of calling it
- Keep a friendly persona: casual tone, occasional emoji, short sentences
- If you accidentally produce text after the JSON, immediately halt and resend just the JSON on its own/separate line

## CHAINED TOOL CALLS
When you need to call multiple tools in sequence:
- After receiving results from tool #1, if you need tool #2, output ONLY the JSON for tool #2
- Do NOT add any commentary between tool calls - just output the raw JSON
- Save all your explanation for AFTER you have all the data you need`;


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
  const syspromptFromFile = fs.readFileSync(path.join(process.cwd(), 'sysprompt.txt'), 'utf-8')
  return MAIN_SYSTEM_PROMPT + "\n\nAvailable modules:\n\n" + modulePrompts.join("\n\n") + "\n\n" + syspromptFromFile;
}

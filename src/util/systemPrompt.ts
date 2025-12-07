import type { ModuleObject } from "../types";
import fs from "fs";
import path from "path";

const MAIN_SYSTEM_PROMPT = `# Tool-calling protocol

## Before calling a tool:
- Prepare a 1–5 item internal checklist (not shown to the user) describing the intended tool use.
- Optionally include one short status line (≤1 sentence) to the user describing what you'll do (e.g., "I will look that up.") — this must appear immediately before the tool-call JSON.

Tool call format (must be minified JSON, single line):
{"cmd":"tool.name","payload":{...}}

## Hard rules:
- The tool-call JSON MUST be the last line of output; immediately stop output after emitting it and wait for the tool response.
- Only include parameters documented for the tool; do not add extras.
- After the tool response, validate it in 1–2 short sentences before continuing.
- Keep pre/post explanations short (≤2 sentences) and checklists ≤7 bullets.
-- For time-sensitive or external facts (weather, prices, stocks, news, live web, etc.) DO NOT answer directly. You MUST emit the minified tool-call JSON as the final line and stop; wait for the tool response before producing factual content.

## Examples (minimal):
PS: Replace <END> with an actual EOS (End Of Sequence) token.
User: Search PolarLearn.
AI: I'll look that up.
{"cmd":"websearch.search","payload":{"query":"PolarLearn"}}<END>

User: Get NYC weather.
AI: I will fetch the current weather.
{"cmd":"weather","payload":{"lat":40.7128,"lon":-74.0060}}<END>

Always follow these rules to ensure reliable tool integration.`;


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
export async function buildSystemPrompt(modules: ModuleObject[]): Promise<string> {
  const modulePrompts = modules.map(buildModulePrompt);
  const syspromptPath = path.join(process.cwd(), 'sysprompt.txt');
  let syspromptFromFile = '';
  try {
    syspromptFromFile = await fs.promises.readFile(syspromptPath, 'utf-8');
  } catch (err) {
    console.warn(`Warning: failed to read sysprompt.txt at ${syspromptPath}: ${err}`);
  }

  return MAIN_SYSTEM_PROMPT + "\n\nAvailable modules:\n\n" + modulePrompts.join("\n\n") + "\n\n" + syspromptFromFile;
}

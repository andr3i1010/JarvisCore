import dotenv from "dotenv";
dotenv.config();

import WebSocket, { WebSocketServer } from "ws";
import { log } from "./util/logger";
import jcCoreCommands from "./util/handlers/jcCommands";
import { setStoreValue, getStoreValue } from "./util/dataStore";
import { execSync } from "child_process";
import { getAIProvider } from "./util/ai/provider";
import { handleAIChat } from "./util/aiChat";
import { loadModulesFromConfig } from "./util/moduleLoader";

export default async function main() {
  const commit = execSync('git rev-parse --short HEAD').toString().trim();
  const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  setStoreValue("git_commit", `${commit}@${branch}`)

  const port = Number(process.env.PORT) || 8080;
  const sock = new WebSocketServer({
    port
  });

  log("info", `WebSocket server started on port ${port}`);

  if (!process.env.PROVIDER) {
    log("error", "No AI provider specified in environment variables (process.env.PROVIDER)");
    process.exit(1);
  }

  const AIProvider = getAIProvider(process.env.PROVIDER);

  log("info", `Using AI provider: ${process.env.PROVIDER}`);

  const moduleObjects = await loadModulesFromConfig("config.json");

  setStoreValue("modules", moduleObjects);

  const mainSystemPrompt = `You are a friendly texting‑style assistant.
  When you decide to invoke a tool, do the following:

  1. First send any natural‑language message you want (optional).
  2. On a separate new line, output the tool‑call JSON exactly with:
    {"cmd":"<toolName>","payload":{…},"passToClient":<true|false>}
    - cmd: the full module name that exactly matches an installed module (for example: "websearch.site", "time.setalarm").
    - payload: object with parameters for the tool
    - passToClient: include only if the client (not server) must execute
  3. The \`cmd\` field MUST be the full module name (include the dot and full suffix). Do NOT use short prefixes or bare module names (for example, do NOT use "websearch"; use "websearch.site"). The server will reject non-exact names.
  4. If the tool/module is not available, respond only in natural language saying:
    "The <moduleName> module does not seem to be installed."
    (Do not output a JSON in this case.)
  5. Keep your friendly persona: casual tone, occasional emoji, short sentences. When invoking a tool, your JSON must stand alone on its own line after any natural text.

  Example:
  Okay, I’ll fetch that site for you.
  {"cmd":"websearch.site","payload":{"url":"https://example.com"}}

  If the module were missing:
  The websearch.site module does not seem to be installed.`;


  const modulePrompts: string[] = [];
  for (const mod of moduleObjects) {
    const name = mod.name; // use full module name (e.g., "websearch.site")
    const params = mod.payload || {};
    const paramsString = Object.entries(params)
      .map(([key, value], idx) => `${idx === 0 ? '' : '  '}${key}: ${value}`)
      .join('\n');

    const sysPrompt = `${name} module: Can be called by using the main tool call structure. Make sure to customize the parameters as following: 
cmd: ${name}
payload:\n  ${paramsString}
passToClient: false`;

    modulePrompts.push(sysPrompt);
  }

  const systemContent = mainSystemPrompt + '\n\n' + modulePrompts.join('\n\n');
  setStoreValue("system_prompt", systemContent);

  sock.on("connection", (client: WebSocket) => {
    const systemContent = getStoreValue("system_prompt") as string;
    (client as any).messages = [{ role: "system", content: systemContent }];
    client.on("message", (data) => {
      const parsedData = JSON.parse(data.toString());
      switch (parsedData.cmd.split(".")[0]) {
        case "jc":
          jcCoreCommands(client, parsedData);
          break;
        case "ai":
          if (parsedData.cmd.split(".")[1] === "chat") {
            const prompt = parsedData.prompt;
            if (!prompt || typeof prompt !== "string") {
              client.send(JSON.stringify({
                ok: false,
                event: "ai.error",
                output: "No valid prompt provided"
              }));
              return;
            }
            (client as any).messages.push({ role: "user", content: prompt });
            handleAIChat(client, AIProvider, moduleObjects, (client as any).messages);
          }
          break;
      }
    });
  });
}

main().catch((err) => {
  log("error", (err as any)?.stack || String(err));
  process.exit(1);
});
import dotenv from "dotenv";
dotenv.config();

import WebSocket, { WebSocketServer } from "ws";
import { log } from "./util/logger";
import jcCoreCommands from "./util/handlers/jcCommands";
import { setStoreValue, getStoreValue } from "./util/dataStore";
import { execSync } from "child_process";
import { getAIProvider } from "./util/ai/provider";
import fs from "fs";

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

  // Load config and modules
  const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
  const moduleObjects: any[] = [];
  for (const modulePath of config.modules) {
    if (modulePath.startsWith('http')) {
      // TODO: Handle URL modules
      log("warn", `URL modules not yet supported: ${modulePath}`);
    } else {
      try {
        const mod = await import(modulePath);
        const moduleObj = Object.values(mod)[0] as any;
        moduleObjects.push(moduleObj);
        log("info", `Loaded module: ${moduleObj.name}`);
      } catch (err) {
        log("error", `Failed to load module ${modulePath}: ${err}`);
      }
    }
  }

  setStoreValue("modules", moduleObjects);

  const mainSystemPrompt = `You are a friendly texting‑style assistant.  
When you decide to invoke a tool, do the following:

1. First send any natural‑language message you want (optional).  
2. On a **separate new line**, output the tool‑call JSON exactly with:  
   {"cmd":"<toolName>","payload":{…},"passToClient":<true|false>}  
   ‑ cmd: name of the tool (e.g., "search", "personal.setalarm")  
   ‑ payload: object with parameters for the tool  
   ‑ passToClient: include only if the client (not server) must execute  
3. If the tool/module is **not available**, respond **only** in natural language saying:  
   "The <moduleName> module does not seem to be installed."  
   (Do *not* output a JSON in this case.)  
4. Keep your friendly persona: casual tone, occasional emoji, short sentences. But when invoking a tool, your JSON must stand **alone** on its own line after any natural text.

Example:  
Okay, I’ll set your alarm for 2 PM.  
{"cmd":"time.setalarm","payload":{"time":"2025‑11‑14T14:00:00Z"}}

If the module were missing:  
The clock module does not seem to be installed.`;

  const modulePrompts: string[] = [];
  for (const mod of moduleObjects) {
    const name = mod.name.split('.')[0]; // e.g., websearch
    const params = mod.payload || {};
    const passToClient = false;

    let sysPrompt = `${name} module: Can be called by using the main tool call structure. Make sure to customize the parameters as following: 
cmd: ${name}
payload:\n  [parameters]
passToClient: ${passToClient}`;

    let paramsString = "";
    const paramKeys = Object.keys(params);
    for (let j = 0; j < paramKeys.length; j++) {
      const key = paramKeys[j];
      if (j === 0) paramsString += `${key}: ${params[key]}`;
      else paramsString += `\n  ${key}: ${params[key]}`;
    }
    sysPrompt = sysPrompt.replace("[parameters]", paramsString.trim());
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
            const messages = (client as any).messages;
            const generator = AIProvider.streamChat(messages, {});
            (async () => {
              try {
                let fullContent = '';
                for await (const packet of generator) {
                  if (packet.content) fullContent += packet.content;
                  client.send(JSON.stringify(packet));
                }
                (client as any).messages.push({ role: "assistant", content: fullContent });
              } catch (err: any) {
                client.send(JSON.stringify({
                  ok: false,
                  event: "ai.error",
                  output: (err as any)?.message || String(err)
                }));
              }
            })();
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
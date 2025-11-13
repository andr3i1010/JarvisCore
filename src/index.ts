import dotenv from "dotenv";
dotenv.config();

import WebSocket, { WebSocketServer } from "ws";
import { log } from "./util/logger";
import jcCoreCommands from "./util/handlers/jcCommands";
import { setStoreValue, getStoreValue } from "./util/dataStore";
import { execSync } from "child_process";
import { getAIProvider } from "./util/ai/provider";
import { ToolCallRequest } from "./types";
import fs from "fs";

function detectToolCalls(text: string): ToolCallRequest[] {
  const toolCalls: ToolCallRequest[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('{') && trimmed.includes('"cmd"')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.cmd && parsed.payload !== undefined) {
          toolCalls.push(parsed);
        }
      } catch (e) {
        // Invalid JSON, skip
      }
    }
  }
  return toolCalls;
}

function logToolCalls(toolCalls: ToolCallRequest[]): void {
  toolCalls.forEach(call => {
    log("info", `Tool call detected: cmd="${call.cmd}", payload=${JSON.stringify(call.payload)}`);
  });
}

async function executeToolCall(toolCall: ToolCallRequest, modules: any[]): Promise<any> {
  const moduleName = toolCall.cmd.split('.')[0];
  const module = modules.find(m => m.name.split('.')[0] === moduleName);

  if (!module) {
    throw new Error(`Module not found: ${moduleName}`);
  }
  if (typeof module.execute !== 'function') {
    throw new Error(`No execute method in module: ${moduleName}`);
  }
  return module.execute(toolCall.payload);
}

function sendPackets(client: WebSocket, packets: any[]): void {
  packets.forEach(p => client.send(JSON.stringify(p)));
}

function filterPacketContent(packets: any[], userFacingContent: string): void {
  let sentContent = '';
  packets.forEach(packet => {
    if (packet.content) {
      const remaining = userFacingContent.substring(sentContent.length);
      if (remaining.length > 0) {
        const toSend = remaining.substring(0, packet.content.length);
        sentContent += toSend;
        // Note: This filters but doesn't send - caller must send
      }
    }
  });
}

async function handleAIChat(
  client: WebSocket,
  AIProvider: any,
  modules: any[],
  messages: any[]
): Promise<void> {
  try {
    let fullContent = '';
    const packets: any[] = [];
    const generator = AIProvider.streamChat(messages, {});

    for await (const packet of generator) {
      if (packet.content) fullContent += packet.content;
      packets.push(packet);
    }

    const detectedCalls = detectToolCalls(fullContent);
    if (detectedCalls.length === 0) {
      sendPackets(client, packets);
      client.send(JSON.stringify({ ok: true, event: "ai.done" }));
      messages.push({ role: "assistant", content: fullContent });
      return;
    }

    logToolCalls(detectedCalls);

    // Check if tool call is at the end of response
    const toolCallAtEnd = detectedCalls.find(tc =>
      fullContent.trim().endsWith(JSON.stringify(tc).trim())
    );

    const userFacingContent = toolCallAtEnd
      ? fullContent.replace(JSON.stringify(toolCallAtEnd), '').trim()
      : fullContent;

    // If tool call not at end, send response as-is
    if (!toolCallAtEnd) {
      sendPackets(client, packets);
      client.send(JSON.stringify({ ok: true, event: "ai.done" }));
      messages.push({ role: "assistant", content: fullContent });
      return;
    }

    // Send filtered content (without tool call JSON)
    if (userFacingContent) {
      let sentContent = '';
      packets.forEach(packet => {
        if (packet.content) {
          const remaining = userFacingContent.substring(sentContent.length);
          if (remaining.length > 0) {
            const toSend = remaining.substring(0, packet.content.length);
            sentContent += toSend;
            client.send(JSON.stringify({ ...packet, content: toSend }));
          }
        } else {
          client.send(JSON.stringify(packet));
        }
      });
    }

    // Execute tool calls
    const toolResults = await Promise.allSettled(
      detectedCalls
        .filter(tc => !tc.passToClient)
        .map(async tc => {
          try {
            const result = await executeToolCall(tc, modules);
            log("info", `Tool execution result for ${tc.cmd}: ${JSON.stringify(result)}`);
            return { cmd: tc.cmd, result, error: null };
          } catch (err: any) {
            log("error", `Tool execution failed for ${tc.cmd}: ${err.message}`);
            return { cmd: tc.cmd, result: null, error: err.message };
          }
        })
    );

    const results = toolResults
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<any>).value);

    if (results.length === 0) return;

    // Send results back to AI for explanation
    const toolResultsText = results
      .map(r => r.error ? `${r.cmd} failed: ${r.error}` : `${r.cmd} result: ${JSON.stringify(r.result)}`)
      .join('\n');

    messages.push({ role: "assistant", content: userFacingContent });
    messages.push({
      role: "user",
      content: `Here are the tool results:\n${toolResultsText}\n\nPlease provide a friendly explanation of these results to the user.`
    });

    let explanationContent = '';
    const explanationGenerator = AIProvider.streamChat(messages, {});
    for await (const packet of explanationGenerator) {
      if (packet.content) {
        explanationContent += packet.content;
        client.send(JSON.stringify(packet));
      }
    }
    client.send(JSON.stringify({ ok: true, event: "done" }));
    messages.push({ role: "assistant", content: explanationContent });
  } catch (err: any) {
    client.send(JSON.stringify({
      ok: false,
      event: "ai.error",
      output: err?.message || String(err)
    }));
  }
}

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
    const name = mod.name.split('.')[0];
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
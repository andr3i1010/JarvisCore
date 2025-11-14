import WebSocket from "ws";
import { log } from "./logger";
import { ToolCallRequest } from "../types";

function detectToolCalls(text: string): Array<ToolCallRequest & { _raw: string; _start: number; _end: number }> {
  // Extract JSON objects from arbitrary text (supports multi-line JSON)
  const toolCalls: Array<ToolCallRequest & { _raw: string; _start: number; _end: number }> = [];

  const len = text.length;
  let i = 0;
  while (i < len) {
    if (text[i] === "{") {
      let inString = false;
      let escape = false;
      let depth = 0;
      let j = i;
      for (; j < len; j++) {
        const ch = text[j];
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === "\\") {
          escape = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            const candidate = text.slice(i, j + 1);
            try {
              const parsed = JSON.parse(candidate);
              if (parsed && parsed.cmd && parsed.payload !== undefined) {
                toolCalls.push({ ...(parsed as ToolCallRequest), _raw: candidate, _start: i, _end: j + 1 });
              }
            } catch {
              // ignore invalid JSON
            }
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

function isToolCallLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{") || !trimmed.includes("\"cmd\"")) {
    return false;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return Boolean(parsed.cmd && parsed.payload !== undefined);
  } catch {
    // If parse fails, still treat it as a potential start of a multi-line tool call
    return true;
  }
}

async function executeToolCall(toolCall: ToolCallRequest, modules: any[]): Promise<any> {
  const toolCmd = toolCall.cmd;
  const module = modules.find((m) => m.name === toolCmd);

  if (!module) {
    throw new Error(`Module not found: ${toolCmd}. Make sure to call the module by its full name (e.g. "websearch.site").`);
  }
  if (typeof module.execute !== "function") {
    throw new Error(
      `No execute method in module: ${module?.name || toolCall.cmd}`
    );
  }
  return module.execute(toolCall.payload);
}

export async function handleAIChat(
  client: WebSocket,
  AIProvider: any,
  modules: any[],
  messages: any[]
): Promise<void> {
  try {
    let fullContent = "";
    const generator = AIProvider.streamChat(messages, {});
    let lineBuffer = "";

    for await (const packet of generator) {
      if (packet.content) {
        fullContent += packet.content;
        lineBuffer += packet.content;
        let newlineIndex = lineBuffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = lineBuffer.slice(0, newlineIndex + 1);
          lineBuffer = lineBuffer.slice(newlineIndex + 1);
          // Stream partial assistant content to client (do not filter tool call JSON)
          if (line.trim()) {
            client.send(JSON.stringify({ ok: true, event: "ai.stream", content: line }));
          }
          newlineIndex = lineBuffer.indexOf("\n");
        }
      }
    }

    if (lineBuffer.trim()) {
      client.send(JSON.stringify({ ok: true, event: "ai.stream", content: lineBuffer }));
    }

    const detectedCalls = detectToolCalls(fullContent);
    if (detectedCalls.length === 0) {
      messages.push({ role: "assistant", content: fullContent });
      client.send(JSON.stringify({ ok: true, event: "ai.done" }));
      return;
    }

    const toolCallAtEnd = detectedCalls.find((tc) =>
      fullContent.trim().endsWith(JSON.stringify(tc).trim())
    );

    if (!toolCallAtEnd) {
      messages.push({ role: "assistant", content: fullContent });
      client.send(JSON.stringify({ ok: true, event: "ai.done" }));
      return;
    }

    const userFacingContent = fullContent;

    const toolResults = await Promise.allSettled(
      detectedCalls
        .filter((tc) => !tc.passToClient)
        .map(async (tc) => {
          try {
            // Notify client that we're about to execute this tool on the server
            try {
              if ((client as any).readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ event: "ai.tool", tool: tc.cmd }));
              }
            } catch (sendErr) {
              // ignore send errors — tool execution should continue
            }

            const result = await executeToolCall(tc, modules);
            log(
              "info",
              `Tool execution result for ${tc.cmd}: ${JSON.stringify(result)}`
            );
            return { cmd: tc.cmd, result, error: null };
          } catch (err: any) {
            log(
              "error",
              `Tool execution failed for ${tc.cmd}: ${err.message}`
            );
            return { cmd: tc.cmd, result: null, error: err.message };
          }
        })
    );

    const results = toolResults
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<any>).value);

    if (results.length === 0) return;

    const toolResultsText = results
      .map((r) =>
        r.error
          ? `${r.cmd} failed: ${r.error}`
          : `${r.cmd} result: ${JSON.stringify(r.result)}`
      )
      .join("\n");

    messages.push({ role: "assistant", content: userFacingContent });
    messages.push({
      role: "user",
      content:
        "Here are the tool results:\n" +
        toolResultsText +
        "\n\nPlease provide a friendly explanation of these results to the user.",
    });

    const explanationGenerator = AIProvider.streamChat(messages, {});
    let explanationEmitted = false;
    for await (const packet of explanationGenerator) {
      if (packet.content) {
        explanationEmitted = explanationEmitted || packet.content.trim().length > 0;
        client.send(JSON.stringify({ ok: true, event: "ai.stream", content: packet.content }));
        messages[messages.length - 1].content =
          (messages[messages.length - 1].content || "") + packet.content;
      }
    }

    if (explanationEmitted) {
      client.send(JSON.stringify({ ok: true, event: "ai.done" }));
    }

  } catch (err: any) {
    client.send(
      JSON.stringify({
        ok: false,
        event: "ai.error",
        output: err?.message || String(err),
      })
    );
  }
}

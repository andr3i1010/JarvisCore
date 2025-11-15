import WebSocket from "ws";
import { log } from "./logger";
import type { ToolCallRequest, ModuleObject } from "../types";

function detectToolCalls(text: string): Array<ToolCallRequest & { _raw: string; _start: number; _end: number }> {
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

async function executeToolCall(toolCall: ToolCallRequest, modules: ModuleObject[]): Promise<any> {
  const toolCmd = toolCall.cmd;
  const mod = modules.find((m) => m.name === toolCmd);
  if (!mod) throw new Error(`Module not found: ${toolCmd}`);
  if (typeof mod.execute !== "function") throw new Error(`Module ${toolCmd} has no execute method`);
  return mod.execute(toolCall.payload);
}

function isTrailingOnlyWhitespaceOrFences(s: string) {
  return s.trim().length === 0 || /^[`~\s]*$/.test(s);
}

function isToolCallAtEnd(fullContent: string, tc: { _end: number }) {
  try {
    const endPos = (tc as any)._end;
    if (typeof endPos !== "number") return false;
    const trailing = fullContent.slice(endPos);
    return isTrailingOnlyWhitespaceOrFences(trailing);
  } catch {
    return false;
  }
}

function stripTrailingToolCallFrom(buffer: string, fullContent: string, detectedCalls: Array<{ _raw: string; _end: number; passToClient?: boolean }>) {
  // If a server-executable tool call appears at the very end of fullContent,
  // remove its raw JSON from the provided buffer (which may be just the
  // portion not yet sent to the client) so we don't send the tool payload.
  const toolCallAtEnd = detectedCalls.find((tc) => !tc.passToClient && isToolCallAtEnd(fullContent, tc));
  if (!toolCallAtEnd) return buffer;
  const raw = (toolCallAtEnd as any)._raw || "";
  if (!raw) return buffer;
  // Remove the last occurrence of raw from buffer, if present.
  const idx = buffer.lastIndexOf(raw);
  if (idx !== -1) {
    return buffer.slice(0, idx) + buffer.slice(idx + raw.length);
  }
  return buffer;
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
          // Stream partial assistant content to client. We'll avoid sending
          // any final tool-call JSON body to the client, but during the
          // incremental stream we can't always be sure a JSON at the end
          // will remain final until the generator completes — so we filter
          // the trailing JSON right after the generator finishes below.
          if (line.trim()) client.send(JSON.stringify({ ok: true, event: "ai.stream", content: line }));
          newlineIndex = lineBuffer.indexOf("\n");
        }
      }
    }
    const detectedCalls = detectToolCalls(fullContent);

    if (lineBuffer.trim()) {
      const finalBufferToSend = stripTrailingToolCallFrom(lineBuffer, fullContent, detectedCalls);
      if (finalBufferToSend.trim()) client.send(JSON.stringify({ ok: true, event: "ai.stream", content: finalBufferToSend }));
    }
    if (detectedCalls.length === 0) {
      messages.push({ role: "assistant", content: fullContent });
      client.send(JSON.stringify({ ok: true, event: "ai.done" }));
      return;
    }

    const toolCallAtEnd = detectedCalls.find((tc) => isToolCallAtEnd(fullContent, tc));

    if (!toolCallAtEnd) {
      // Tool call not at the very end of the assistant content — treat as
      // normal assistant output.
      messages.push({ role: "assistant", content: fullContent });
      client.send(JSON.stringify({ ok: true, event: "ai.done" }));
      return;
    }

    const userFacingContent = fullContent;

    // Calls that should be executed on the server
    const serverExecutable = detectedCalls.filter((tc) => !tc.passToClient);

    if (serverExecutable.length === 0) {
      // Nothing for the server to run; pass-through the assistant content
      messages.push({ role: "assistant", content: userFacingContent });
      client.send(JSON.stringify({ ok: true, event: "ai.done" }));
      return;
    }

    const toolResults = await Promise.all(
      serverExecutable.map(async (tc) => {
        try {
          // Notify client that we're about to execute this tool on the server
          try {
            if ((client as any).readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ ok: true, event: "ai.tool", tool: tc.cmd }));
            }
          } catch {
            // ignore send errors — continue to execute the tool
          }

          const result = await executeToolCall(tc, modules);
          log("info", `Tool execution result for ${tc.cmd}: ${JSON.stringify(result)}`);
          return { cmd: tc.cmd, result, error: null };
        } catch (err: any) {
          log("error", `Tool execution failed for ${tc.cmd}: ${err?.message || String(err)}`);
          return { cmd: tc.cmd, result: null, error: err?.message || String(err) };
        }
      })
    );

    if (!toolResults || toolResults.length === 0) {
      client.send(JSON.stringify({ ok: true, event: "ai.done" }));
      return;
    }

    const toolResultsText = toolResults
      .map((r) => (r.error ? `${r.cmd} failed: ${r.error}` : `${r.cmd} result: ${JSON.stringify(r.result)}`))
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

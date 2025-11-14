import WebSocket from "ws";
import { log } from "./logger";
import { ToolCallRequest } from "../types";

function detectToolCalls(text: string): ToolCallRequest[] {
  const toolCalls: ToolCallRequest[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("{") && trimmed.includes("\"cmd\"")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.cmd && parsed.payload !== undefined) {
          toolCalls.push(parsed);
        }
      } catch {
        // ignore invalid JSON lines
      }
    }
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
    return false;
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
          if (line.trim() && !isToolCallLine(line)) {
            client.send(JSON.stringify({ content: line }));
          }
          newlineIndex = lineBuffer.indexOf("\n");
        }
      }
    }

    if (lineBuffer.trim() && !isToolCallLine(lineBuffer)) {
      client.send(JSON.stringify({ content: lineBuffer }));
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

    const userFacingContent = fullContent
      .replace(JSON.stringify(toolCallAtEnd), "")
      .trim();

    const toolResults = await Promise.allSettled(
      detectedCalls
        .filter((tc) => !tc.passToClient)
        .map(async (tc) => {
          try {
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
        client.send(JSON.stringify({ content: packet.content }));
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

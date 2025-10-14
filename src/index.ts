import { WebSocketServer } from "ws"
import { initAIProvider, AI } from "./utils/ai"
import { streamText } from "ai"

async function main() {
  const ws = new WebSocketServer({
    port: 8080,
    host: "0.0.0.0",
  })

  const fs = await import('fs/promises');
  let systemPrompt = "";
  try {
    systemPrompt = (await fs.readFile("./sysprompt.txt", "utf8")).trim();
  } catch (err) {
    console.warn("Could not read sysprompt.txt, using empty system prompt.");
  }

  ws.on("connection", (socket) => {
    let history = [];
    socket.on("message", async (msg) => {
      const { input } = JSON.parse(msg.toString())
      const aiModel = process.env.AI_MODEL!
      const model = AI(aiModel)

      // Accept either a string or a message object/array
      const newMessages = Array.isArray(input)
        ? input
        : [{ role: "user", content: input }];

      // Add new user messages to history
      history.push(...newMessages);

      // Build prompt: system + history
      const prompt = [
        { role: "system", content: systemPrompt },
        ...history
      ];

      const result = await streamText({
        model,
        prompt,
      })

      // Add assistant's reply to history
      let reply = "";
      for await (const chunk of result.textStream) {
        reply += chunk;
        socket.send(JSON.stringify({ type: "chunk", data: chunk }))
      }
      history.push({ role: "assistant", content: reply });
    })
  })

  const aiProvider = process.env.AI_PROVIDER
  const aiModel = process.env.AI_MODEL

  if (!aiProvider) throw new Error("AI_PROVIDER environment variable is not set")
  if (!aiModel) throw new Error("AI_MODEL environment variable is not set")

  initAIProvider(aiProvider)

  console.log(`✅ | JarvisCore is running on wss://localhost:8080`)
}

main().catch(console.error)
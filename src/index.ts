import dotenv from "dotenv";
dotenv.config();

import WebSocket, { WebSocketServer } from "ws";
import { log } from "./util/logger";
import jcCoreCommands from "./util/handlers/jcCommands";
import { setStoreValue } from "./util/dataStore";
import { execSync } from "child_process";
import { getAIProvider } from "./util/ai/provider";

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

  sock.on("connection", (client: WebSocket) => {
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
            const messages = [{ role: "user", content: prompt }];
            const generator = AIProvider.streamChat(messages, {});
            (async () => {
              try {
                for await (const packet of generator) {
                  client.send(JSON.stringify(packet));
                }
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
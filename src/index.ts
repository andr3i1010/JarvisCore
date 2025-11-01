import WebSocket, { WebSocketServer } from "ws";
import { log } from "./util/logger";
import jcCoreCommands from "./util/handlers/jcCommands";
import { setStoreValue } from "./util/dataStore";
import { execSync } from "child_process";

export default async function main() {
  const commit = execSync('git rev-parse --short HEAD').toString().trim();
  const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  setStoreValue("git_commit", `${commit}@${branch}`)

  const port = Number(process.env.PORT) || 8080;
  const sock = new WebSocketServer({
    port
  });

  log("info", `WebSocket server started on port ${port}`);

  sock.on("connection", (client: WebSocket) => {
    client.on("message", (data) => {
      const parsedData = JSON.parse(data.toString());
      switch (parsedData.type) {
        case "jc":
          jcCoreCommands(client, parsedData);
          break;
      }
    });
  });
}

main().catch((err) => {
  log("error", (err as any)?.stack || String(err));
  process.exit(1);
});
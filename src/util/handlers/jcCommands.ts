import type WebSocket from "ws";
import { ToolCallRequest, ToolCallResponse } from "../../types";
import { getStoreValue } from "../dataStore";
import { log } from "../logger";
const { spawn } = require('child_process');

export default async function jcCommands(client: WebSocket, parsedData: ToolCallRequest) {
  const command = parsedData.cmd.split(".")[1];

  switch (command) {
    case "version":
      const resPayload: ToolCallResponse = {
        ok: true,
        payload: {
          ver: "1",
          git: getStoreValue("git_commit") || "unknown"
        }
      };
      client.send(JSON.stringify(resPayload));
      break;
    case "reboot":
      if (parsedData.payload?.password === process.env.PASSWORD) {
        client.send("Rebooting server...");

        // Spawn a new instance of the current script
        spawn(process.argv[0], process.argv.slice(1), {
          stdio: 'inherit',
        });

        // Give the new process a moment to start
        setTimeout(() => {
          log("info", "Old server exiting.");
          process.exit(0);
        }, 500); // half a second is usually enough for self-hosted servers

      } else {
        const resPayload: ToolCallResponse = {
          ok: false,
          output: "Access denied"
        };
        client.send(JSON.stringify(resPayload));
      }
      break;
  }
}
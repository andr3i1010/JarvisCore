import WebSocket from "ws";
import * as readline from "readline";

const client = new WebSocket("ws://localhost:8080");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

let waitingForResponse = false;

const sendPrompt = (line: string) => {
  const prompt = line.trim();
  if (!prompt) {
    rl.prompt();
    return;
  }

  if (prompt.toLowerCase() === "exit" || prompt.toLowerCase() === "quit") {
    client.close();
    return;
  }

  waitingForResponse = true;
  client.send(JSON.stringify({ cmd: "ai.chat", prompt }));
};

client.on("open", () => {
  console.log("Connected to server");
  rl.prompt();
});

client.on("message", (data) => {
  try {
    const message = JSON.parse(data.toString());
    if (message.content) {
      process.stdout.write(message.content);
    }
    if ((message.event === "ai.done" || message.event === "done") && waitingForResponse) {
      waitingForResponse = false;
      process.stdout.write("\n");
      rl.prompt();
    }
  } catch (err) {
    console.error("Failed to parse server message", err);
  }
});

client.on("close", () => {
  console.log("\nDisconnected from server");
  rl.close();
});

client.on("error", (err) => {
  console.error("WebSocket error:", err);
  rl.close();
});

rl.on("line", (line) => {
  if (waitingForResponse) {
    console.log("Still waiting for the previous response, please wait...");
    rl.prompt();
    return;
  }
  sendPrompt(line);
});
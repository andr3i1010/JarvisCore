import WebSocket from 'ws';
import * as readline from 'readline';

const ws = new WebSocket('ws://localhost:8080');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let isConnected = false;
let isWaitingForResponse = false;
let promptShown = false;
let responseBuffer = '';

ws.on('open', () => {
  console.log('Connected to JarvisCore');
  isConnected = true;
  promptUser();
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  if (message.content) {
    responseBuffer += message.content;
    process.stdout.write(message.content);
  }
  // Show prompt when response is done (either from AI provider or server completion)
  if ((message.event === 'ai.done' || message.event === 'done') && isWaitingForResponse && !promptShown) {
    isWaitingForResponse = false;
    promptShown = true;
    responseBuffer = '';
    process.stdout.write('\n> ');
  }
});

ws.on('close', () => {
  console.log('\nDisconnected from server');
  rl.close();
  process.exit(0);
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err);
  rl.close();
  process.exit(1);
});

function promptUser() {
  if (!isWaitingForResponse && isConnected) {
    promptShown = false;
    rl.question('> ', (line) => {
      const userInput = line.trim();

      if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
        ws.close();
        return;
      }

      if (!userInput) {
        promptUser();
        return;
      }

      isWaitingForResponse = true;
      ws.send(JSON.stringify({
        cmd: 'ai.chat',
        prompt: userInput
      }));
    });
  }
}

rl.on('close', () => {
  if (isConnected) {
    ws.close();
  }
});
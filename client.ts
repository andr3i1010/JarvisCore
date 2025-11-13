import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  console.log('Connected to server');

  // Example 1: Send a chat message
  ws.send(JSON.stringify({
    cmd: 'ai.chat',
    prompt: 'Hello, how are you?'
  }));


  // Example 2: Send a tool call directly
  setTimeout(() => {
    ws.send(JSON.stringify({
      cmd: 'ai.chat',
      prompt: 'Look up what PolarLearn is'
    }));
  }, 2000);
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  process.stdout.write(message.content || '')
});

ws.on('close', () => {
  console.log('Connection closed');
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err);
});
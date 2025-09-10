import WebSocket, { WebSocketServer } from 'ws';

const ws = new WebSocketServer({
  port: 8080,
  host: "0.0.0.0"
});
import WebSocket, { WebSocketServer } from 'ws';

let port = 8080;

const ws = new WebSocketServer({
  port: port,
  host: "0.0.0.0"
});

console.log("WebSocket server started on port:", port);
console.log("Visit this website at: http://localhost:" + port);
import { log } from "./src/util/logger";

const socket = new WebSocket("ws://localhost:8080")

// Only send after connection is established to avoid "Sent before connected" DOMException
socket.addEventListener('open', () => {
  log('info', 'WebSocket connected')
  socket.send(JSON.stringify({ cmd: "ai.chat", prompt: "Look up for me, what is PolarLearn?" }))
})

socket.addEventListener('message', (message) => {
  try {
    const data = JSON.parse(message.data)
    if (typeof data.content === 'string') {
      process.stdout.write(data.content)
    }
  } catch (err) {
    log('warn', 'Failed to parse incoming message:', { err: String(err) })
    log('debug', `Raw message: ${message.data}`)
  }
})

socket.addEventListener('error', (err) => {
  log('error', `WebSocket error: ${String(err)}`)
})

socket.addEventListener('close', (ev) => {
  log('info', `WebSocket closed ${ev.code} ${ev.reason}`)
})
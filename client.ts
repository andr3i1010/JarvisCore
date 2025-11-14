const socket = new WebSocket("ws://localhost:8080")

// Only send after connection is established to avoid "Sent before connected" DOMException
socket.addEventListener('open', () => {
  console.log('WebSocket connected')
  socket.send(JSON.stringify({ cmd: "ai.chat", prompt: "Hello, AI!" }))
})

socket.addEventListener('message', (message) => {
  try {
    const data = JSON.parse(message.data)
    if (typeof data.content === 'string') {
      process.stdout.write(data.content)
    }
  } catch (err) {
    console.warn('Failed to parse incoming message:', err)
    console.log('Raw message:', message.data)
  }
})

socket.addEventListener('error', (err) => {
  console.error('WebSocket error:', err)
})

socket.addEventListener('close', (ev) => {
  console.log('WebSocket closed', ev.code, ev.reason)
})
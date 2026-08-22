import { MessageStreamEvent } from '@ai-agent-pro/shared/type.js'

export async function consumeNDJSON(
  response: Response,
  onEvent: (event: MessageStreamEvent) => void,
) {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  if (!response.body) {
    throw new Error('Streaming response body is unavailable')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()

    if (done) {
      buffer += decoder.decode()
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (line.trim()) {
        onEvent(JSON.parse(line) as MessageStreamEvent)
      }
    }
  }

  if (buffer.trim()) {
    onEvent(JSON.parse(buffer) as MessageStreamEvent)
  }
}

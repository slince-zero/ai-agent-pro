import type { MessageStreamEvent, TokenUsage } from '@ai-agent-pro/shared/type.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isTokenUsage(value: unknown): value is TokenUsage {
  return (
    isRecord(value) &&
    typeof value.inputTokens === 'number' &&
    typeof value.outputTokens === 'number' &&
    typeof value.totalTokens === 'number'
  )
}

function isMessageStreamEvent(value: unknown): value is MessageStreamEvent {
  if (!isRecord(value)) return false

  switch (value.type) {
    case 'text_delta':
      return typeof value.delta === 'string'
    case 'reasoning_delta':
      return typeof value.delta === 'string'
    case 'usage':
      return isTokenUsage(value.usage)
    case 'round_start':
      return typeof value.round === 'number'
    case 'tool_call':
      return (
        typeof value.id === 'string' &&
        typeof value.name === 'string' &&
        typeof value.arguments === 'string'
      )
    case 'tool_result':
      return (
        typeof value.id === 'string' &&
        typeof value.name === 'string' &&
        typeof value.ok === 'boolean' &&
        (value.preview === undefined || typeof value.preview === 'string')
      )
    case 'done':
      return true
    case 'error':
      return typeof value.message === 'string'
    default:
      return false
  }
}

function emitEvent(line: string, onEvent: (event: MessageStreamEvent) => void) {
  if (!line.trim()) return

  const event: unknown = JSON.parse(line)
  if (!isMessageStreamEvent(event)) {
    throw new Error('Received an invalid stream event')
  }

  onEvent(event)
}

export async function consumeNDJSON(
  response: Response,
  onEvent: (event: MessageStreamEvent) => void,
): Promise<void> {
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
      emitEvent(line, onEvent)
    }
  }

  emitEvent(buffer, onEvent)
}

export type ClientMessage = {
  role: 'user' | 'assistant'
  content: string
}

export function isClientMessage(message: unknown): message is ClientMessage {
  if (!message || typeof message !== 'object') return false

  const candidate = message as Partial<ClientMessage>
  return (
    (candidate.role === 'user' || candidate.role === 'assistant') &&
    typeof candidate.content === 'string'
  )
}

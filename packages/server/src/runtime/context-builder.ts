import { getSystemPrompt } from '../prompts/system.js'
import type { ClientMessage } from '../types/chat.js'
import type { ModelMessage } from './model-client/types.js'

export function buildAgentConversation(
  messages: ClientMessage[],
  systemPrompt = getSystemPrompt(),
): ModelMessage[] {
  return [
    { role: 'system', content: systemPrompt },
    ...messages.map<ModelMessage>((message) =>
      message.role === 'user'
        ? { role: 'user', content: message.content }
        : { role: 'assistant', content: message.content },
    ),
  ]
}

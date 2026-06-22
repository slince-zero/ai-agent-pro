import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

import { getSystemPrompt } from '../prompts/system.js'
import type { ClientMessage } from '../types/chat.js'

export function buildAgentConversation(
  messages: ClientMessage[],
  systemPrompt = getSystemPrompt(),
): ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: systemPrompt },
    ...messages.map<ChatCompletionMessageParam>((message) =>
      message.role === 'user'
        ? { role: 'user', content: message.content }
        : { role: 'assistant', content: message.content },
    ),
  ]
}

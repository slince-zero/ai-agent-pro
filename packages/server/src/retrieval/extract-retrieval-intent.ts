import type { ChatMessage } from '@ai-agent-pro/shared/type.js'
import { retrievalIntentSchema } from './retrieval-intent.js'
import type { RetrievalIntent } from './retrieval-intent.js'

type IntentModelRequest = (messages: ChatMessage[], signal: AbortSignal) => Promise<string>

export async function extractRetrievalIntent(
  input: string,
  signal: AbortSignal,
  requestModel: IntentModelRequest,
): Promise<RetrievalIntent> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: '你是检索意图解析器，请只输出 JSON',
    },
    {
      role: 'user',
      content: input,
    },
  ]

  const res = await requestModel(messages, signal)
  if (!res.trim()) throw new Error('Model returned an empty retrieval intent')

  const value: unknown = JSON.parse(res)

  return retrievalIntentSchema.parse(value)
}

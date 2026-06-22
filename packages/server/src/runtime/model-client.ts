import { MODEL } from '../services/openai.js'
import { getOpenAITools } from '../tools/index.js'
import type { ModelClient, ModelClientOptions, ModelStream } from './types.js'

export function createOpenAIModelClient({
  openai,
  model = MODEL,
  tools = getOpenAITools(),
}: ModelClientOptions): ModelClient {
  return {
    async streamChat({ messages, signal }): Promise<ModelStream> {
      return (await openai.chat.completions.create(
        {
          model,
          stream: true,
          stream_options: { include_usage: true },
          messages,
          tools,
          tool_choice: 'auto',
          ...({ thinking: { type: 'disabled' } } as Record<string, unknown>),
        },
        { signal },
      )) as ModelStream
    },
  }
}

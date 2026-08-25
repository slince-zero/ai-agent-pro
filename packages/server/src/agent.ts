import OpenAI from 'openai'
import type { AgentStreamEvent, ChatMessage } from '@ai-agent-pro/shared/type.js'

export type AgentRunContext = {
  signal: AbortSignal
}

type ModelStreamChunk = Exclude<AgentStreamEvent, { type: 'done' }>

type ModelRequest = (
  messages: ChatMessage[],
  context: AgentRunContext,
) => AsyncIterable<ModelStreamChunk>

function createClient() {
  return new OpenAI({
    // 如果不做处理的话，这里读不到环境变量，因为 process.env 读的是当前 node 进程中的环境变量
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: 'https://api.deepseek.com',
  })
}

async function* requestDeepSeekStream(
  messages: ChatMessage[],
  context: AgentRunContext,
): AsyncGenerator<ModelStreamChunk> {
  const stream = await createClient().chat.completions.create(
    {
      model: 'deepseek-v4-flash',
      messages,
      stream: true,
      stream_options: {
        include_usage: true,
      },
    },
    {
      signal: context.signal,
    },
  )

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta.content

    if (delta) {
      yield {
        type: 'text_delta',
        delta,
      }
    }

    if (chunk.usage) {
      yield {
        type: 'usage',
        usage: {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
        },
      }
    }
  }
}

export async function* askAgentStream(
  messages: ChatMessage[],
  context: AgentRunContext,
  requestModel: ModelRequest = requestDeepSeekStream,
): AsyncGenerator<AgentStreamEvent> {
  let completeAnswer = ''

  for await (const event of requestModel(messages, context)) {
    if (event.type === 'text_delta') {
      completeAnswer += event.delta
    }
    yield event
  }

  if (!completeAnswer.trim()) {
    throw new Error('Model returned an empty answer')
  }

  yield { type: 'done' } as const
}

import OpenAI from 'openai'
import type { ModelResult, TokenUsage } from '@ai-agent-pro/shared/type.js'

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type ModelStreamChunk =
  | {
      type: 'text_delta'
      delta: string
    }
  | {
      type: 'usage'
      usage: TokenUsage
    }

type ModelRequest = (messages: ChatMessage[]) => AsyncIterable<ModelStreamChunk>

function createClient() {
  return new OpenAI({
    // 如果不做处理的话，这里读不到环境变量，因为 process.env 读的是当前 node 进程中的环境变量
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: 'https://api.deepseek.com',
  })
}

// async function requestDeepSeek(messages: ChatMessage[]): Promise<ModelResult> {
//   const response = await createClient().chat.completions.create({
//     model: 'deepseek-v4-flash',
//     messages,
//   })

//   const content = response.choices[0]?.message.content

//   if (!content) {
//     throw new Error('Model returned an empty answer')
//   }

//   return {
//     message: content,
//     usage: {
//       inputTokens: response.usage?.prompt_tokens ?? 0,
//       outputTokens: response.usage?.completion_tokens ?? 0,
//       totalTokens: response.usage?.total_tokens ?? 0,
//     },
//   }
// }

async function* requestDeepSeekStream(messages: ChatMessage[]): AsyncGenerator<ModelStreamChunk> {
  const stream = await createClient().chat.completions.create({
    model: 'deepseek-v4-flash',
    messages,
    stream: true,
    stream_options: {
      include_usage: true,
    },
  })

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
  requestModel: ModelRequest = requestDeepSeekStream,
) {
  let completeAnswer = ''

  for await (const event of requestModel(messages)) {
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

// export async function askAgent(
//   messages: ChatMessage[],
//   requestModel: ModelRequest = requestDeepSeek,
// ): Promise<ModelResult> {
//   const res = await requestModel(messages)

//   if (!res.message.trim()) {
//     throw new Error('Model returned an empty answer')
//   }

//   return res
// }

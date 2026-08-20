import OpenAI from 'openai'
import type { ModelResult } from '@ai-agent-pro/shared/type.js'

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type ModelRequest = (messages: ChatMessage[]) => Promise<ModelResult>

function createClient() {
  return new OpenAI({
    // 如果不做处理的话，这里读不到环境变量，因为 process.env 读的是当前 node 进程中的环境变量
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: 'https://api.deepseek.com',
  })
}

export async function requestDeepSeek(messages: ChatMessage[]): Promise<ModelResult> {
  const response = await createClient().chat.completions.create({
    model: 'deepseek-v4-flash',
    messages,
  })

  const content = response.choices[0]?.message.content

  if (!content) {
    throw new Error('Model returned an empty answer')
  }

  return {
    message: content,
    usage: {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    },
  }
}

export async function askAgent(
  messages: ChatMessage[],
  requestModel: ModelRequest = requestDeepSeek,
): Promise<ModelResult> {
  const res = await requestModel(messages)

  if (!res.message.trim()) {
    throw new Error('Model returned an empty answer')
  }

  return res
}

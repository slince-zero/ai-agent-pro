import OpenAI from 'openai'
import type { ModelResult } from '../../shared/type.js'

type ModelRequest = (question: string) => Promise<ModelResult>

function createClient() {
  return new OpenAI({
    // 如果不做处理的话，这里读不到环境变量，因为 process.env 读的是当前 node 进程中的环境变量
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: 'https://api.deepseek.com',
  })
}

export async function requestDeepSeek(question: string): Promise<ModelResult> {
  const response = await createClient().chat.completions.create({
    model: 'deepseek-v4-flash',
    messages: [
      {
        role: 'user',
        content: question,
      },
    ],
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
  question: string,
  requestModel: ModelRequest = requestDeepSeek,
): Promise<ModelResult> {
  const res = await requestModel(question)

  if (!res.message.trim()) {
    throw new Error('Model returned an empty answer')
  }

  return res
}

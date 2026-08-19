import OpenAI from 'openai'

function createClient() {
  return new OpenAI({
    // 如果不做处理的话，这里读不到环境变量，因为 process.env 读的是当前 node 进程中的环境变量
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: 'https://api.deepseek.com',
  })
}

export type ModelRequest = (question: string) => Promise<string>

export async function requestDeepSeek(question: string): Promise<string> {
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

  return content
}

export async function askAgent(
  question: string,
  requestModel: ModelRequest = requestDeepSeek,
): Promise<string> {
  const answer = await requestModel(question)

  if (!answer.trim()) {
    throw new Error('Model returned an empty answer')
  }

  return answer
}

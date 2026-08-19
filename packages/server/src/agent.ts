import OpenAI from 'openai'

const client = new OpenAI({
  // 如果不做处理的话，这里读不到环境变量，因为 process.env 读的是当前 node 进程中的环境变量
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.deepseek.com',
})

export async function askAgent(question: string): Promise<string> {
  const response = await client.chat.completions.create({
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

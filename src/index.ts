import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: 'sk-161f364d50a0441882ea37a9ec21dbd0',
  baseURL: 'https://api.deepseek.com',
})

const input = '介绍下自己'

const response = await client.chat.completions.create({
  model: 'deepseek-v4-flash',
  messages: [
    {
      role: 'user',
      content: input,
    },
  ],
})

import OpenAI from 'openai'

import { env } from '../env.js'

export const MODEL = env.DEEPSEEK_MODEL

export function createOpenAIClient() {
  return new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.DEEPSEEK_BASE_URL,
  })
}

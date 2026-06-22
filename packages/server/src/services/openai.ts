import OpenAI from 'openai'

import { env } from '../env.js'
import { createOpenAICompatibleModelClient } from '../model-clients/openai-compatible.js'
import type { ModelClient, ModelProvider } from '../runtime/model-client/types.js'

export const MODEL_PROVIDER = env.MODEL_PROVIDER as ModelProvider
export const MODEL_BASE_URL = env.MODEL_BASE_URL ?? env.DEEPSEEK_BASE_URL
export const MODEL = env.MODEL_NAME ?? env.DEEPSEEK_MODEL

export function createOpenAIClient() {
  return new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: MODEL_BASE_URL,
  })
}

export function createDefaultModelClient(): ModelClient {
  if (MODEL_PROVIDER === 'anthropic') {
    throw new Error('Anthropic ModelClient adapter is reserved but not implemented yet')
  }

  return createOpenAICompatibleModelClient({
    openai: createOpenAIClient(),
    model: MODEL,
  })
}

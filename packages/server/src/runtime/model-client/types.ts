import type { ToolDefinition } from '../../tools/types.js'

export type ModelToolCallDelta = {
  index: number
  id?: string
  name?: string
  argumentsDelta?: string
}

export type ModelStreamChunk = {
  choices: {
    delta?: {
      content?: string
      toolCalls?: ModelToolCallDelta[]
    }
    finishReason?: string | null
  }[]
  usage?: {
    inputTokens?: number
    outputTokens?: number
  }
}

export type ModelStream = AsyncIterable<ModelStreamChunk>

export type ModelAssistantToolCall = {
  id: string
  name: string
  arguments: string
}

export type ModelMessage =
  | {
      role: 'system' | 'user'
      content: string
    }
  | {
      role: 'assistant'
      content: string | null
      toolCalls?: ModelAssistantToolCall[]
    }
  | {
      role: 'tool'
      toolCallId: string
      content: string
    }

export type ModelClient = {
  streamChat: (input: {
    messages: ModelMessage[]
    tools: ToolDefinition[]
    signal: AbortSignal
  }) => Promise<ModelStream>
}

export type ModelProvider = 'openai-compatible' | 'anthropic'

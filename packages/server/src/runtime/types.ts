import type OpenAI from 'openai'
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'
import type pino from 'pino'

import type { ClientMessage } from '../types/chat.js'

export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; toolCallId: string; name: string; args: unknown }
  | {
      type: 'tool_result'
      toolCallId: string
      name: string
      preview: string
      result: string
    }
  | { type: 'error'; error: string }

export type AgentUsage = {
  inputTokens: number
  outputTokens: number
}

export type RunAgentOptions = {
  openai: OpenAI
  messages: ClientMessage[]
  onEvent: (event: AgentEvent) => void | Promise<void>
  signal: AbortSignal
  logger?: pino.Logger
}

export type ModelStream = AsyncIterable<ChatCompletionChunk>

export type ModelClient = {
  streamChat: (input: {
    messages: ChatCompletionMessageParam[]
    signal: AbortSignal
  }) => Promise<ModelStream>
}

export type ModelClientOptions = {
  openai: OpenAI
  model?: string
  tools?: ChatCompletionTool[]
}

export type ToolCallAccumulator = {
  id: string
  name: string
  arguments: string
}

export type OrderedToolCall = ToolCallAccumulator

export type AssistantToolCall = ChatCompletionMessageToolCall

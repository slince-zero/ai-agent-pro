import type pino from 'pino'

import type { ClientMessage } from '../types/chat.js'
import type { ModelClient } from './model-client/types.js'

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
  modelClient: ModelClient
  messages: ClientMessage[]
  onEvent: (event: AgentEvent) => void | Promise<void>
  signal: AbortSignal
  logger?: pino.Logger
}

export type ToolCallAccumulator = {
  id: string
  name: string
  arguments: string
}

export type OrderedToolCall = ToolCallAccumulator

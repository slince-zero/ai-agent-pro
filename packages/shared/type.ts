export type TokenUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type AgentStreamEvent =
  | {
      type: 'text_delta'
      delta: string
    }
  | {
      type: 'usage'
      usage: TokenUsage
    }
  | {
      type: 'tool_call'
      id: string
      name: string
      arguments: string
    }
  | {
      type: 'tool_result'
      id: string
      name: string
      ok: boolean
    }
  | {
      type: 'done'
    }

export type MessageStreamEvent =
  | AgentStreamEvent
  | {
      type: 'error'
      message: string
    }

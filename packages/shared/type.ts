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
      type: 'done'
    }

export type MessageStreamEvent =
  | AgentStreamEvent
  | {
      type: 'error'
      message: string
    }

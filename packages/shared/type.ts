export type TokenUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export type ModelResult = {
  message: string
  usage: TokenUsage
}

// 后面加入工具时，可以继续扩展
export type MessageStreamEvent =
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
  | {
      type: 'error'
      error: string
    }

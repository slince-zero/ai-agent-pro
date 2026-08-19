export type TokenUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export type ModelResult = {
  message: string
  usage: TokenUsage
}

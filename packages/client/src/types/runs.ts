export type RunStatus = 'running' | 'completed' | 'failed' | 'canceled'

export type RunMessage = {
  id: string
  role: string
  content: string | null
  preview: string | null
  createdAt: string
}

export type RunToolCall = {
  id: string
  toolCallId: string | null
  name: string
  arguments?: unknown
  resultPreview?: string | null
  status: string
  error: string | null
  startedAt: string
  finishedAt: string | null
}

export type RunTrace = {
  id: string
  session: {
    id: string
    title: string
  }
  status: RunStatus
  model: string
  error: string | null
  inputTokens: number | null
  outputTokens: number | null
  cost: number | null
  startedAt: string
  finishedAt: string | null
  userMessage: RunMessage | null
  assistantMessage: RunMessage | null
  toolCalls: RunToolCall[]
}

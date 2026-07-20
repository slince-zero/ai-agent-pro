import type { LucideIcon } from 'lucide-react'

export type Message = {
  id?: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  toolEvents?: ToolEvent[]
  workflowStage?: WorkflowStage
  createdAt?: string
  usage?: {
    inputTokens: number
    outputTokens: number
    cost: number
  }
}

export type Citation = {
  id: string
  messageId?: string
  documentId: string | null
  chunkId: string | null
  title: string
  uri: string | null
  sourceRef: string | null
  snippet: string
  metadata?: unknown
  createdAt?: string
}

export type ToolEvent = {
  id: string
  name: string
  args?: unknown
  status: 'running' | 'done'
  preview?: string
}

export type WorkflowStage = {
  role: 'planner' | 'executor' | 'critic'
  sequence: number
  status: 'running' | 'completed' | 'failed' | 'canceled'
}

type ServerEventMeta = {
  eventId?: string
}

export type ServerEvent = ServerEventMeta &
  (
    | { type: 'run_id'; runId: string }
    | { type: 'citations'; citations: Citation[] }
    | ({ type: 'workflow_stage' } & WorkflowStage)
    | { type: 'text'; text: string }
    | { type: 'tool_call'; toolCallId: string; name: string; args: unknown }
    | {
        type: 'tool_result'
        toolCallId: string
        name: string
        preview: string
        status?: 'completed' | 'failed'
        durationMs?: number
        error?: string
      }
    | { type: 'usage'; inputTokens: number; outputTokens: number; cost: number }
    | { type: 'done' }
    | { type: 'error'; error: string }
  )

export type PromptPreset = {
  label: string
  prompt: string
  icon: LucideIcon
}

export type ChatSession = {
  id: string
  title: string
  status: string
  createdAt: string
  updatedAt: string
}

export type WorkflowMode = 'single' | 'multi_agent'

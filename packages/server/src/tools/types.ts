import type { z } from 'zod'

export type JsonSchema = {
  type: 'object'
  properties: Record<string, unknown>
  required?: readonly string[]
  additionalProperties?: boolean
  [key: string]: unknown
}

export type ToolCategory = 'web' | 'code' | 'repository' | 'system'

export type ToolGovernance = {
  category: ToolCategory
  sideEffect: boolean
  requiresAuth: boolean
  timeoutMs: number
}

export type ToolDefinition = {
  name: string
  description: string
  parameters: JsonSchema
  governance: ToolGovernance
}

export type AppTool<Args> = ToolDefinition & {
  schema: z.ZodType<Args>
  run: (args: Args) => Promise<string>
}

export type ToolRunStatus = 'completed' | 'failed'

export type ToolRunResult = {
  content: string
  status: ToolRunStatus
  durationMs: number
  error?: string
}

import type { z } from 'zod'

export type JsonSchema = {
  type: 'object'
  properties: Record<string, unknown>
  required?: readonly string[]
  additionalProperties?: boolean
}

export type ToolDefinition = {
  name: string
  description: string
  parameters: JsonSchema
}

export type AppTool<Args> = ToolDefinition & {
  schema: z.ZodType<Args>
  run: (args: Args) => Promise<string>
}

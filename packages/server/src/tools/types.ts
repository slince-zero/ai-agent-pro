import type { z } from 'zod'

export type JsonSchema = {
  type: 'object'
  properties: Record<string, unknown>
  required?: readonly string[]
  additionalProperties?: boolean
}

export type AppTool<Args> = {
  name: string
  description: string
  parameters: JsonSchema
  schema: z.ZodType<Args>
  run: (args: Args) => Promise<string>
}

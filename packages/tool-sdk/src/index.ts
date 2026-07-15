import { z } from 'zod'

const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/
const PLUGIN_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/

export type JsonSchema = {
  type: 'object'
  properties: Record<string, unknown>
  required?: readonly string[]
  additionalProperties?: boolean
  [key: string]: unknown
}

export type ToolCategory = 'web' | 'code' | 'repository' | 'system' | (string & {})

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

export type ToolRunContext = {
  signal: AbortSignal
}

export type AppTool<Args> = ToolDefinition & {
  schema: z.ZodType<Args, any>
  run: (args: Args, context: ToolRunContext) => string | Promise<string>
}

export type DefinedTool<Schema extends z.ZodType> = ToolDefinition & {
  schema: Schema
  run: (args: z.output<Schema>, context: ToolRunContext) => string | Promise<string>
}

export type ToolInput<Schema extends z.ZodType> = Omit<DefinedTool<Schema>, 'parameters'> & {
  parameters?: JsonSchema
}

export type AnyAppTool = AppTool<any>

export type ToolPlugin = {
  name: string
  version: string
  tools: readonly AnyAppTool[]
}

export type ToolRunStatus = 'completed' | 'failed'

export type ToolRunResult = {
  content: string
  status: ToolRunStatus
  durationMs: number
  error?: string
}

function assertObjectJsonSchema(value: unknown, label: string): asserts value is JsonSchema {
  if (!value || typeof value !== 'object') {
    throw new Error(`${label} must be an object JSON Schema.`)
  }

  const schema = value as Record<string, unknown>
  if (schema.type !== 'object' || !schema.properties || typeof schema.properties !== 'object') {
    throw new Error(`${label} must use type "object" and define properties.`)
  }
}

export function assertToolDefinition(tool: AnyAppTool): void {
  if (!TOOL_NAME_PATTERN.test(tool.name)) {
    throw new Error(
      `Invalid tool name "${tool.name}". Use 1-64 letters, numbers, underscores, or hyphens.`,
    )
  }
  if (!tool.description.trim()) {
    throw new Error(`Tool "${tool.name}" must have a description.`)
  }
  if (!tool.governance.category.trim()) {
    throw new Error(`Tool "${tool.name}" must have a governance category.`)
  }
  if (!Number.isFinite(tool.governance.timeoutMs) || tool.governance.timeoutMs <= 0) {
    throw new Error(`Tool "${tool.name}" must have a positive timeoutMs.`)
  }
  assertObjectJsonSchema(tool.parameters, `Tool "${tool.name}" parameters`)
  if (!tool.schema || typeof tool.schema.safeParse !== 'function') {
    throw new Error(`Tool "${tool.name}" must provide a Zod schema.`)
  }
  if (typeof tool.run !== 'function') {
    throw new Error(`Tool "${tool.name}" must provide a run function.`)
  }
}

export function defineTool<const Schema extends z.ZodType>(
  input: ToolInput<Schema>,
): DefinedTool<Schema> {
  const generatedParameters = input.parameters ?? z.toJSONSchema(input.schema)
  assertObjectJsonSchema(generatedParameters, `Tool "${input.name}" parameters`)

  const tool: DefinedTool<Schema> = {
    ...input,
    parameters: generatedParameters,
  }
  assertToolDefinition(tool)
  return tool
}

export function definePlugin<const Plugin extends ToolPlugin>(plugin: Plugin): Plugin {
  if (!PLUGIN_NAME_PATTERN.test(plugin.name)) {
    throw new Error(
      `Invalid plugin name "${plugin.name}". Use lowercase letters, numbers, dots, underscores, or hyphens.`,
    )
  }
  if (!plugin.version.trim()) {
    throw new Error(`Plugin "${plugin.name}" must have a version.`)
  }

  const names = new Set<string>()
  for (const tool of plugin.tools) {
    assertToolDefinition(tool)
    if (names.has(tool.name)) {
      throw new Error(`Plugin "${plugin.name}" contains duplicate tool "${tool.name}".`)
    }
    names.add(tool.name)
  }

  return plugin
}

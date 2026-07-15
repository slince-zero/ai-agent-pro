import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from '@modelcontextprotocol/sdk/client/stdio.js'
import {
  CallToolResultSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'
import type pino from 'pino'
import { z } from 'zod'

import { defineTool, type AppTool, type JsonSchema } from '../tools/types.js'

const DEFAULT_TIMEOUT_MS = 10_000
const MCP_TOOL_PREFIX = 'mcp'
const MAX_TOOL_NAME_LENGTH = 64

const mcpServerEntrySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    command: z.string().trim().min(1),
    args: z.array(z.string()).default([]),
    cwd: z.string().trim().min(1).optional(),
    env: z.record(z.string(), z.string()).default({}),
    timeoutMs: z.coerce.number().int().positive().default(DEFAULT_TIMEOUT_MS),
    disabled: z.boolean().default(false),
  })
  .strict()

const mcpConfigSchema = z.union([
  z.array(mcpServerEntrySchema),
  z
    .object({
      mcpServers: z.record(z.string(), mcpServerEntrySchema.omit({ name: true })),
    })
    .strict(),
])

export type McpServerConfig = z.infer<typeof mcpServerEntrySchema> & {
  name: string
}

export type McpConnectedServer = {
  config: McpServerConfig
  listTools: (cursor?: string) => Promise<{ tools: Tool[]; nextCursor?: string }>
  callTool: (toolName: string, args: Record<string, unknown>) => Promise<CallToolResult>
  close: () => Promise<void>
}

export type ConnectMcpServer = (
  config: McpServerConfig,
  logger?: pino.Logger,
) => Promise<McpConnectedServer>

type DiscoverMcpToolsOptions = {
  configs: McpServerConfig[]
  connectServer?: ConnectMcpServer
  logger?: pino.Logger
}

function sanitizeToolNamePart(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

export function createMcpModelToolName(serverName: string, toolName: string) {
  const baseName = [
    MCP_TOOL_PREFIX,
    sanitizeToolNamePart(serverName),
    sanitizeToolNamePart(toolName),
  ]
    .filter(Boolean)
    .join('_')

  if (baseName.length <= MAX_TOOL_NAME_LENGTH) return baseName

  const suffix = Math.abs(hashString(baseName)).toString(36)
  return `${baseName.slice(0, MAX_TOOL_NAME_LENGTH - suffix.length - 1)}_${suffix}`
}

function hashString(value: string) {
  let hash = 0
  for (const char of value) {
    hash = (hash << 5) - hash + char.charCodeAt(0)
    hash |= 0
  }
  return hash
}

function normalizeJsonSchema(schema: Tool['inputSchema']): JsonSchema {
  return {
    ...schema,
    type: 'object',
    properties: schema.properties ?? {},
    required: schema.required,
    additionalProperties: schema.additionalProperties as boolean | undefined,
  }
}

function formatMcpToolResult(result: CallToolResult) {
  const textParts: string[] = []
  const nonTextContent: unknown[] = []

  for (const item of result.content ?? []) {
    if (item.type === 'text') {
      textParts.push(item.text)
      continue
    }

    if (item.type === 'image' || item.type === 'audio') {
      nonTextContent.push({
        type: item.type,
        mimeType: item.mimeType,
        data: `<base64 ${item.data.length} chars>`,
      })
      continue
    }

    nonTextContent.push(item)
  }

  const text = textParts.join('\n\n')
  if (!result.isError && nonTextContent.length === 0 && !result.structuredContent) {
    return text
  }

  return JSON.stringify(
    {
      ...(text ? { text } : {}),
      ...(result.structuredContent ? { structuredContent: result.structuredContent } : {}),
      ...(nonTextContent.length > 0 ? { content: nonTextContent } : {}),
      ...(result.isError ? { isError: true } : {}),
    },
    null,
    2,
  )
}

function toMcpAppTool({
  server,
  tool,
  modelToolName,
}: {
  server: McpConnectedServer
  tool: Tool
  modelToolName: string
}): AppTool<Record<string, unknown>> {
  const readOnly = tool.annotations?.readOnlyHint === true
  const destructive = tool.annotations?.destructiveHint === true

  return defineTool({
    name: modelToolName,
    description: [
      `[MCP:${server.config.name}]`,
      tool.description || tool.title || `Call MCP tool ${tool.name}.`,
    ].join(' '),
    parameters: normalizeJsonSchema(tool.inputSchema),
    governance: {
      category: 'system',
      sideEffect: destructive || !readOnly,
      requiresAuth: Object.keys(server.config.env).length > 0,
      timeoutMs: server.config.timeoutMs,
    },
    schema: z.record(z.string(), z.unknown()),
    async run(args) {
      const result = await server.callTool(tool.name, args)
      const content = formatMcpToolResult(result)

      if (result.isError) {
        throw new Error(content || `MCP tool ${server.config.name}/${tool.name} returned an error.`)
      }

      return content
    },
  })
}

function normalizeMcpConfigEntry(name: string, value: z.infer<typeof mcpServerEntrySchema>) {
  return {
    ...value,
    name: value.name ?? name,
  }
}

export function parseMcpServersConfig(raw: string | undefined): McpServerConfig[] {
  if (!raw?.trim()) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`MCP_SERVERS_JSON is not valid JSON: ${(error as Error).message}`, {
      cause: error,
    })
  }

  const result = mcpConfigSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
      return `${path}: ${issue.message}`
    })
    throw new Error(`MCP_SERVERS_JSON is invalid: ${issues.join('; ')}`)
  }

  const configs = Array.isArray(result.data)
    ? result.data.map((config, index) =>
        normalizeMcpConfigEntry(config.name ?? `server_${index}`, config),
      )
    : Object.entries(result.data.mcpServers).map(([name, config]) =>
        normalizeMcpConfigEntry(name, config),
      )

  return configs.filter((config) => !config.disabled)
}

export async function connectStdioMcpServer(
  config: McpServerConfig,
  logger?: pino.Logger,
): Promise<McpConnectedServer> {
  const client = new Client({
    name: 'ai-agent-pro',
    version: '1.0.0',
  })
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    cwd: config.cwd,
    env: {
      ...getDefaultEnvironment(),
      ...config.env,
    },
    stderr: 'pipe',
  })

  transport.stderr?.on('data', (chunk) => {
    logger?.warn({ serverName: config.name, stderr: chunk.toString() }, 'MCP server stderr')
  })

  await client.connect(transport, { timeout: config.timeoutMs })

  return {
    config,
    listTools: (cursor) =>
      client.listTools(cursor ? { cursor } : undefined, {
        timeout: config.timeoutMs,
      }),
    callTool: async (toolName, args) => {
      const result = await client.callTool(
        {
          name: toolName,
          arguments: args,
        },
        CallToolResultSchema,
        {
          timeout: config.timeoutMs,
        },
      )
      return CallToolResultSchema.parse(result)
    },
    close: () => client.close(),
  }
}

export async function discoverMcpTools({
  configs,
  connectServer = connectStdioMcpServer,
  logger,
}: DiscoverMcpToolsOptions): Promise<AppTool<Record<string, unknown>>[]> {
  const discovered: AppTool<Record<string, unknown>>[] = []
  const usedNames = new Set<string>()

  for (const config of configs) {
    let server: McpConnectedServer
    try {
      server = await connectServer(config, logger?.child({ mcpServer: config.name }))
    } catch (error) {
      logger?.warn({ err: error, serverName: config.name }, 'MCP server connection failed')
      continue
    }

    try {
      const serverTools: AppTool<Record<string, unknown>>[] = []
      const serverToolNames = new Set<string>()
      let cursor: string | undefined
      do {
        const result = await server.listTools(cursor)
        for (const tool of result.tools) {
          const modelToolName = createMcpModelToolName(config.name, tool.name)
          if (usedNames.has(modelToolName) || serverToolNames.has(modelToolName)) {
            logger?.warn(
              { serverName: config.name, toolName: tool.name, modelToolName },
              'Skipping duplicate MCP tool name',
            )
            continue
          }

          serverToolNames.add(modelToolName)
          serverTools.push(toMcpAppTool({ server, tool, modelToolName }))
        }
        cursor = result.nextCursor
      } while (cursor)

      for (const toolName of serverToolNames) {
        usedNames.add(toolName)
      }
      discovered.push(...serverTools)
    } catch (error) {
      logger?.warn({ err: error, serverName: config.name }, 'MCP tool discovery failed')
      await server.close().catch((closeError) => {
        logger?.warn({ err: closeError, serverName: config.name }, 'MCP server close failed')
      })
    }
  }

  return discovered
}

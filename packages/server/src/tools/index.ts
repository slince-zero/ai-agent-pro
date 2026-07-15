import type pino from 'pino'
import type { z } from 'zod'

import { env } from '../env.js'
import { discoverMcpTools, parseMcpServersConfig } from '../services/mcp-client.js'
import { codeExecuteTool } from './code-execute.js'
import { githubRepoTool } from './github.js'
import { definePlugin, type AppTool, type ToolDefinition, type ToolRunResult } from './types.js'
import { webFetchTool } from './web-fetch.js'

export function getBuiltinTools(sandboxEnabled: boolean) {
  return [githubRepoTool, webFetchTool, ...(sandboxEnabled ? [codeExecuteTool] : [])]
}

const builtinPlugin = definePlugin({
  name: 'builtin',
  version: '1.0.0',
  tools: getBuiltinTools(env.CODE_SANDBOX_ENABLED),
})
const builtinTools = [...builtinPlugin.tools]
type RegisteredTool = AppTool<any>
type ToolRegistry = Record<string, RegisteredTool | undefined>

let mcpTools: RegisteredTool[] = []
let mcpToolsPromise: Promise<void> | undefined

export const toolDispatch = Object.fromEntries(
  builtinTools.map((tool) => [tool.name, tool]),
) as ToolRegistry

function getAllTools() {
  return [...builtinTools, ...mcpTools]
}

function rebuildToolDispatch() {
  for (const key of Object.keys(toolDispatch)) {
    delete toolDispatch[key]
  }

  for (const tool of getAllTools()) {
    toolDispatch[tool.name] = tool
  }
}

async function ensureMcpToolsLoaded(logger?: pino.Logger) {
  if (!mcpToolsPromise) {
    mcpToolsPromise = (async () => {
      const configs = parseMcpServersConfig(env.MCP_SERVERS_JSON)
      if (configs.length === 0) return

      mcpTools = await discoverMcpTools({
        configs,
        logger,
      })
      rebuildToolDispatch()
      logger?.info({ count: mcpTools.length }, 'MCP tools loaded')
    })().catch((error) => {
      mcpTools = []
      rebuildToolDispatch()
      logger?.warn({ err: error }, 'MCP tool loading failed')
    })
  }

  await mcpToolsPromise
}

export async function getModelTools(logger?: pino.Logger): Promise<ToolDefinition[]> {
  await ensureMcpToolsLoaded(logger)

  return getAllTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    governance: tool.governance,
  }))
}

export async function getOpenAITools(logger?: pino.Logger) {
  const tools = await getModelTools(logger)

  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
    },
  }))
}

function formatValidationIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message,
  }))
}

function failure(content: string, durationMs: number, error: string): ToolRunResult {
  return {
    content,
    status: 'failed',
    durationMs,
    error,
  }
}

function completed(content: string, durationMs: number): ToolRunResult {
  return {
    content,
    status: 'completed',
    durationMs,
  }
}

async function withTimeout<T>(
  run: (signal: AbortSignal) => T | Promise<T>,
  timeoutMs: number,
  toolName: string,
  parentSignal?: AbortSignal,
) {
  if (parentSignal?.aborted) {
    throw new Error(`工具执行已取消：${toolName}`)
  }

  const controller = new AbortController()
  let timeout: NodeJS.Timeout | undefined
  let onParentAbort: (() => void) | undefined

  try {
    const pending: Promise<T>[] = [
      Promise.resolve().then(() => run(controller.signal)),
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          const error = new Error(`工具执行超时：${toolName} 超过 ${timeoutMs}ms 未完成`)
          reject(error)
          controller.abort(error)
        }, timeoutMs)
      }),
    ]

    if (parentSignal) {
      pending.push(
        new Promise<T>((_resolve, reject) => {
          onParentAbort = () => {
            const error = new Error(`工具执行已取消：${toolName}`)
            reject(error)
            controller.abort(parentSignal.reason ?? error)
          }
          parentSignal.addEventListener('abort', onParentAbort, { once: true })
        }),
      )
    }

    return await Promise.race(pending)
  } finally {
    if (timeout) clearTimeout(timeout)
    if (parentSignal && onParentAbort) {
      parentSignal.removeEventListener('abort', onParentAbort)
    }
  }
}

export async function runToolDetailed(
  name: string,
  args: unknown,
  logger?: pino.Logger,
  registry?: ToolRegistry,
  signal?: AbortSignal,
): Promise<ToolRunResult> {
  const startedAt = Date.now()
  if (!registry) {
    await ensureMcpToolsLoaded(logger)
  }

  const resolvedRegistry = registry ?? toolDispatch
  const tool = resolvedRegistry[name]

  if (!tool) {
    const durationMs = Date.now() - startedAt
    logger?.warn({ toolName: name }, '未知工具')
    return failure(`未知工具：${name}`, durationMs, `未知工具：${name}`)
  }

  const parsed = tool.schema.safeParse(args)
  if (!parsed.success) {
    const durationMs = Date.now() - startedAt
    const issues = formatValidationIssues(parsed.error)
    logger?.warn({ toolName: name, issues }, '工具参数校验失败')
    const content = JSON.stringify(
      {
        error: '工具参数校验失败',
        tool: name,
        issues,
      },
      null,
      2,
    )
    return failure(content, durationMs, '工具参数校验失败')
  }

  try {
    const content = await withTimeout(
      (toolSignal) => tool.run(parsed.data, { signal: toolSignal }),
      tool.governance.timeoutMs,
      name,
      signal,
    )
    return completed(content, Date.now() - startedAt)
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const message = (error as Error).message
    logger?.error({ err: error, toolName: name }, '工具执行失败')
    return failure(`工具执行出错：${message}`, durationMs, message)
  }
}

export async function runTool(name: string, args: unknown, logger?: pino.Logger) {
  const result = await runToolDetailed(name, args, logger)
  return result.content
}

import type pino from 'pino'
import type { z } from 'zod'

import { githubRepoTool } from './github.js'
import type { AppTool, ToolDefinition, ToolRunResult } from './types.js'
import { webFetchTool } from './web-fetch.js'

const tools = [githubRepoTool, webFetchTool]
type RegisteredTool = AppTool<unknown>

export const toolDispatch = Object.fromEntries(tools.map((tool) => [tool.name, tool])) as Record<
  string,
  RegisteredTool | undefined
>

export function getModelTools(): ToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    governance: tool.governance,
  }))
}

export function getOpenAITools() {
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, toolName: string) {
  let timeout: NodeJS.Timeout | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`工具执行超时：${toolName} 超过 ${timeoutMs}ms 未完成`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export async function runToolDetailed(
  name: string,
  args: unknown,
  logger?: pino.Logger,
  registry: Record<string, RegisteredTool | undefined> = toolDispatch,
): Promise<ToolRunResult> {
  const startedAt = Date.now()
  const tool = registry[name]

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
    const content = await withTimeout(tool.run(parsed.data), tool.governance.timeoutMs, name)
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

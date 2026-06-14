import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import type pino from 'pino'
import type { z } from 'zod'

import { githubRepoTool } from './github.js'
import type { AppTool } from './types.js'
import { webFetchTool } from './web-fetch.js'

const tools = [githubRepoTool, webFetchTool]
type RegisteredTool = AppTool<unknown>

export const toolDispatch = Object.fromEntries(tools.map((tool) => [tool.name, tool])) as Record<
  string,
  RegisteredTool | undefined
>

export function getOpenAITools(): ChatCompletionTool[] {
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

export async function runTool(name: string, args: unknown, logger?: pino.Logger) {
  const tool = toolDispatch[name]

  if (!tool) {
    logger?.warn({ toolName: name }, '未知工具')
    return `未知工具：${name}`
  }

  const parsed = tool.schema.safeParse(args)
  if (!parsed.success) {
    logger?.warn(
      { toolName: name, issues: formatValidationIssues(parsed.error) },
      '工具参数校验失败',
    )
    return JSON.stringify(
      {
        error: '工具参数校验失败',
        tool: name,
        issues: formatValidationIssues(parsed.error),
      },
      null,
      2,
    )
  }

  try {
    return await tool.run(parsed.data)
  } catch (error) {
    logger?.error({ err: error, toolName: name }, '工具执行失败')
    return `工具执行出错：${(error as Error).message}`
  }
}

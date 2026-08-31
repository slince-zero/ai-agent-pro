import { z } from 'zod'
import type { ChatCompletionMessageFunctionToolCall } from 'openai/resources/index.mjs'
import { readPage, readPageInputSchema } from './read-page.js'
import { search, searchInputSchema } from './search.js'
import { isAbortError, ToolConfigurationError, ToolProviderHttpError } from './tool-errors.js'

type ExecuteToolDependencies = {
  search?: typeof search
  readPage?: typeof readPage
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function invalidArgumentsResult(error: z.ZodError) {
  return JSON.stringify({
    ok: false,
    error: 'invalid_tool_arguments',
    issues: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  })
}

function failedToolResult(error: unknown): string {
  if (error instanceof ToolConfigurationError) {
    return JSON.stringify({
      ok: false,
      error: 'tool_unavailable',
      message: error.message,
      retryable: false,
    })
  }

  if (error instanceof ToolProviderHttpError && error.status === 429) {
    return JSON.stringify({
      ok: false,
      error: 'rate_limited',
      message: 'Tool provider rate limited the request',
      retryable: true,
    })
  }

  return JSON.stringify({
    ok: false,
    error: 'provider_error',
    message: 'Tool provider request failed',
    retryable: true,
  })
}

export async function executeTool(
  toolCall: ChatCompletionMessageFunctionToolCall,
  signal: AbortSignal,
  dependencies: ExecuteToolDependencies = {},
): Promise<string> {
  signal.throwIfAborted()

  if (toolCall.function.name !== 'search' && toolCall.function.name !== 'read_page') {
    return JSON.stringify({
      ok: false,
      error: 'unknown_tool',
      message: `Unknown tool: ${toolCall.function.name}`,
    })
  }

  try {
    if (toolCall.function.name === 'search') {
      const inputResult = searchInputSchema.safeParse(parseJson(toolCall.function.arguments))

      if (!inputResult.success) {
        return invalidArgumentsResult(inputResult.error)
      }

      const results = await (dependencies.search ?? search)(inputResult.data, signal)

      return JSON.stringify({
        ok: true,
        results,
      })
    }

    const inputResult = readPageInputSchema.safeParse(parseJson(toolCall.function.arguments))

    if (!inputResult.success) {
      return invalidArgumentsResult(inputResult.error)
    }

    const result = await (dependencies.readPage ?? readPage)(inputResult.data, signal)

    return JSON.stringify({
      ok: true,
      result,
    })
  } catch (error: unknown) {
    if (signal.aborted || isAbortError(error)) {
      throw error
    }

    return failedToolResult(error)
  }
}

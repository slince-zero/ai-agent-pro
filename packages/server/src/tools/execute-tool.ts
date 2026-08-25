import { z } from 'zod'
import { search, searchInputSchema } from './search.js'
import { ChatCompletionMessageFunctionToolCall } from 'openai/resources/index.mjs'

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

export async function executeTool(
  toolCall: ChatCompletionMessageFunctionToolCall,
  signal: AbortSignal,
): Promise<string> {
  if (toolCall.function.name !== 'search') {
    return JSON.stringify({
      ok: false,
      error: 'unknown_tool',
      message: `Unknown tool: ${toolCall.function.name}`,
    })
  }

  const inputResult = searchInputSchema.safeParse(parseJson(toolCall.function.arguments))

  if (!inputResult.success) {
    return invalidArgumentsResult(inputResult.error)
  }

  const results = await search(inputResult.data, signal)

  return JSON.stringify({
    ok: true,
    results,
  })
}

import { buildAgentConversation } from '../runtime/context-builder.js'
import { parseModelStream } from '../runtime/stream-parser.js'
import { runToolCalls } from '../runtime/tool-runner.js'
import type { AgentUsage, RunAgentOptions } from '../runtime/types.js'
import { getModelTools } from '../tools/index.js'

const MAX_ITERATIONS = 6

export type { AgentEvent, AgentUsage } from '../runtime/types.js'

export async function runAgent({
  modelClient,
  messages,
  onEvent,
  signal,
  logger,
}: RunAgentOptions): Promise<AgentUsage> {
  const conversation = buildAgentConversation(messages)
  const tools = await getModelTools(logger)
  let totalInputTokens = 0
  let totalOutputTokens = 0

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (signal.aborted) {
      return { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
    }

    let streamResult
    try {
      const stream = await modelClient.streamChat({
        messages: conversation,
        tools,
        signal,
      })
      streamResult = await parseModelStream({
        stream,
        signal,
        onEvent,
      })
    } catch (error) {
      if (signal.aborted) {
        return { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
      }
      throw error
    }

    totalInputTokens += streamResult.usage.inputTokens
    totalOutputTokens += streamResult.usage.outputTokens

    if (streamResult.aborted) {
      return { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
    }

    if (streamResult.finishReason !== 'tool_calls' || streamResult.toolCalls.size === 0) {
      return { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
    }

    const toolResult = await runToolCalls({
      conversation,
      assistantText: streamResult.text,
      toolCalls: streamResult.toolCalls,
      signal,
      logger,
      onEvent,
    })

    if (toolResult.aborted) {
      return { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
    }
  }

  const maxIterMsg = `Agent 工具迭代次数超过上限（${MAX_ITERATIONS}）`
  logger?.error({ maxIterations: MAX_ITERATIONS }, maxIterMsg)
  await onEvent({
    type: 'error',
    error: maxIterMsg,
  })

  return { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
}

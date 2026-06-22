import type pino from 'pino'

import { runToolDetailed } from '../tools/index.js'
import type { ModelAssistantToolCall, ModelMessage } from './model-client/types.js'
import type { AgentEvent, OrderedToolCall, ToolCallAccumulator } from './types.js'

type ExecuteTool = typeof runToolDetailed

type RunToolCallsOptions = {
  conversation: ModelMessage[]
  assistantText: string
  toolCalls: Map<number, ToolCallAccumulator>
  signal: AbortSignal
  logger?: pino.Logger
  executeTool?: ExecuteTool
  onEvent: (event: AgentEvent) => void | Promise<void>
}

export function orderToolCalls(toolCalls: Map<number, ToolCallAccumulator>): OrderedToolCall[] {
  return [...toolCalls.entries()]
    .toSorted(([a]: [number, unknown], [b]: [number, unknown]) => a - b)
    .map(([, value]: [number, ToolCallAccumulator]) => value)
}

export function toAssistantToolCalls(calls: OrderedToolCall[]): ModelAssistantToolCall[] {
  return calls.map((call) => ({
    id: call.id,
    name: call.name,
    arguments: call.arguments || '{}',
  }))
}

export async function runToolCalls({
  conversation,
  assistantText,
  toolCalls,
  signal,
  logger,
  executeTool = runToolDetailed,
  onEvent,
}: RunToolCallsOptions) {
  const orderedCalls = orderToolCalls(toolCalls)

  conversation.push({
    role: 'assistant',
    content: assistantText || null,
    toolCalls: toAssistantToolCalls(orderedCalls),
  })

  for (const call of orderedCalls) {
    if (signal.aborted) return { aborted: true }

    let parsedArgs: Record<string, unknown> = {}
    try {
      parsedArgs = call.arguments ? JSON.parse(call.arguments) : {}
    } catch (error) {
      const durationMs = 0
      const message = `工具参数解析失败：${(error as Error).message}`
      conversation.push({
        role: 'tool',
        toolCallId: call.id,
        content: message,
      })
      await onEvent({
        type: 'tool_result',
        toolCallId: call.id,
        name: call.name,
        preview: message.slice(0, 120),
        result: message,
        status: 'failed',
        durationMs,
        error: message,
      })
      continue
    }

    await onEvent({
      type: 'tool_call',
      toolCallId: call.id,
      name: call.name,
      args: parsedArgs,
    })

    const result = await executeTool(call.name, parsedArgs, logger)
    conversation.push({
      role: 'tool',
      toolCallId: call.id,
      content: result.content,
    })

    await onEvent({
      type: 'tool_result',
      toolCallId: call.id,
      name: call.name,
      preview: result.content.slice(0, 120),
      result: result.content,
      status: result.status,
      durationMs: result.durationMs,
      error: result.error,
    })
  }

  return { aborted: false }
}

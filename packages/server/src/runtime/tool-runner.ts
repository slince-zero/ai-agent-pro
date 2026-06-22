import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type pino from 'pino'

import { runTool } from '../tools/index.js'
import type {
  AgentEvent,
  AssistantToolCall,
  OrderedToolCall,
  ToolCallAccumulator,
} from './types.js'

type ExecuteTool = typeof runTool

type RunToolCallsOptions = {
  conversation: ChatCompletionMessageParam[]
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

export function toAssistantToolCalls(calls: OrderedToolCall[]): AssistantToolCall[] {
  return calls.map((call) => ({
    id: call.id,
    type: 'function',
    function: {
      name: call.name,
      arguments: call.arguments || '{}',
    },
  }))
}

export async function runToolCalls({
  conversation,
  assistantText,
  toolCalls,
  signal,
  logger,
  executeTool = runTool,
  onEvent,
}: RunToolCallsOptions) {
  const orderedCalls = orderToolCalls(toolCalls)

  conversation.push({
    role: 'assistant',
    content: assistantText || null,
    tool_calls: toAssistantToolCalls(orderedCalls),
  })

  for (const call of orderedCalls) {
    if (signal.aborted) return { aborted: true }

    let parsedArgs: Record<string, unknown> = {}
    try {
      parsedArgs = call.arguments ? JSON.parse(call.arguments) : {}
    } catch (error) {
      const message = `工具参数解析失败：${(error as Error).message}`
      conversation.push({
        role: 'tool',
        tool_call_id: call.id,
        content: message,
      })
      await onEvent({
        type: 'tool_result',
        toolCallId: call.id,
        name: call.name,
        preview: message.slice(0, 120),
        result: message,
      })
      continue
    }

    await onEvent({
      type: 'tool_call',
      toolCallId: call.id,
      name: call.name,
      args: parsedArgs,
    })

    const resultText = await executeTool(call.name, parsedArgs, logger)
    conversation.push({
      role: 'tool',
      tool_call_id: call.id,
      content: resultText,
    })

    await onEvent({
      type: 'tool_result',
      toolCallId: call.id,
      name: call.name,
      preview: resultText.slice(0, 120),
      result: resultText,
    })
  }

  return { aborted: false }
}

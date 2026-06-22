import type { ModelStream } from './model-client/types.js'
import type { AgentEvent, AgentUsage, ToolCallAccumulator } from './types.js'

export type StreamParseResult = {
  text: string
  finishReason: string | null
  toolCalls: Map<number, ToolCallAccumulator>
  usage: AgentUsage
  aborted: boolean
}

type ParseModelStreamOptions = {
  stream: ModelStream
  signal: AbortSignal
  onEvent: (event: AgentEvent) => void | Promise<void>
}

export async function parseModelStream({
  stream,
  signal,
  onEvent,
}: ParseModelStreamOptions): Promise<StreamParseResult> {
  let text = ''
  let finishReason: string | null = null
  const toolCalls = new Map<number, ToolCallAccumulator>()
  const usage: AgentUsage = {
    inputTokens: 0,
    outputTokens: 0,
  }

  for await (const chunk of stream) {
    if (signal.aborted) {
      return { text, finishReason, toolCalls, usage, aborted: true }
    }

    const choice = chunk.choices[0]
    if (!choice) continue
    const delta = choice.delta

    if (delta?.content) {
      text += delta.content
      await onEvent({ type: 'text', text: delta.content })
    }

    if (delta?.toolCalls) {
      for (const part of delta.toolCalls) {
        const index = part.index
        const existing = toolCalls.get(index) ?? {
          id: '',
          name: '',
          arguments: '',
        }
        if (part.id) existing.id = part.id
        if (part.name) existing.name = part.name
        if (part.argumentsDelta) existing.arguments += part.argumentsDelta
        toolCalls.set(index, existing)
      }
    }

    if (choice.finishReason) finishReason = choice.finishReason

    if (chunk.usage) {
      usage.inputTokens += chunk.usage.inputTokens ?? 0
      usage.outputTokens += chunk.usage.outputTokens ?? 0
    }
  }

  return { text, finishReason, toolCalls, usage, aborted: false }
}

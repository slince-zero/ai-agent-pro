import type { AgentEvent, AgentUsage, ModelStream, ToolCallAccumulator } from './types.js'

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

    if (delta?.tool_calls) {
      for (const part of delta.tool_calls) {
        const index = part.index
        const existing = toolCalls.get(index) ?? {
          id: '',
          name: '',
          arguments: '',
        }
        if (part.id) existing.id = part.id
        if (part.function?.name) existing.name = part.function.name
        if (part.function?.arguments) existing.arguments += part.function.arguments
        toolCalls.set(index, existing)
      }
    }

    if (choice.finish_reason) finishReason = choice.finish_reason

    if (chunk.usage) {
      usage.inputTokens += chunk.usage.prompt_tokens ?? 0
      usage.outputTokens += chunk.usage.completion_tokens ?? 0
    }
  }

  return { text, finishReason, toolCalls, usage, aborted: false }
}

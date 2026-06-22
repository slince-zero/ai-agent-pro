import type OpenAI from 'openai'
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'

import type {
  ModelAssistantToolCall,
  ModelClient,
  ModelMessage,
  ModelStream,
  ModelStreamChunk,
} from '../runtime/model-client/types.js'
import type { ToolDefinition } from '../tools/types.js'

type OpenAICompatibleModelClientOptions = {
  openai: OpenAI
  model: string
}

function toOpenAITool(tool: ToolDefinition): ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
    },
  }
}

function toOpenAIToolCall(call: ModelAssistantToolCall): ChatCompletionMessageToolCall {
  return {
    id: call.id,
    type: 'function',
    function: {
      name: call.name,
      arguments: call.arguments || '{}',
    },
  }
}

function toOpenAIMessage(message: ModelMessage): ChatCompletionMessageParam {
  switch (message.role) {
    case 'system':
    case 'user':
      return {
        role: message.role,
        content: message.content,
      }
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content,
        ...(message.toolCalls ? { tool_calls: message.toolCalls.map(toOpenAIToolCall) } : {}),
      }
    case 'tool':
      return {
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: message.content,
      }
  }
}

function toModelChunk(chunk: ChatCompletionChunk): ModelStreamChunk {
  return {
    choices: chunk.choices.map((choice) => ({
      delta: {
        ...(choice.delta?.content ? { content: choice.delta.content } : {}),
        ...(choice.delta?.tool_calls
          ? {
              toolCalls: choice.delta.tool_calls.map((part) => ({
                index: part.index,
                ...(part.id ? { id: part.id } : {}),
                ...(part.function?.name ? { name: part.function.name } : {}),
                ...(part.function?.arguments ? { argumentsDelta: part.function.arguments } : {}),
              })),
            }
          : {}),
      },
      finishReason: choice.finish_reason,
    })),
    ...(chunk.usage
      ? {
          usage: {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
          },
        }
      : {}),
  }
}

async function* normalizeOpenAIStream(stream: AsyncIterable<ChatCompletionChunk>): ModelStream {
  for await (const chunk of stream) {
    yield toModelChunk(chunk)
  }
}

export function createOpenAICompatibleModelClient({
  openai,
  model,
}: OpenAICompatibleModelClientOptions): ModelClient {
  return {
    async streamChat({ messages, tools, signal }) {
      const stream = await openai.chat.completions.create(
        {
          model,
          stream: true,
          stream_options: { include_usage: true },
          messages: messages.map(toOpenAIMessage),
          tools: tools.map(toOpenAITool),
          tool_choice: 'auto',
          ...({ thinking: { type: 'disabled' } } as Record<string, unknown>),
        },
        { signal },
      )

      return normalizeOpenAIStream(stream as AsyncIterable<ChatCompletionChunk>)
    },
  }
}

import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
} from 'openai/resources/index.mjs'
import type { AgentStreamEvent, ChatMessage } from '@ai-agent-pro/shared/type.js'
import { createDeepSeekClient } from './deepseek-client.js'
import { agentLimits } from './util.js'
import { executeTool } from './tools/execute-tool.js'
import { retrievalTools } from './tools/retrieval-tools.js'

export type AgentRunContext = {
  signal: AbortSignal
}

export type AssistantTurn = {
  text: string
  toolCalls: ChatCompletionMessageFunctionToolCall[]
}

/**
 * 模型流的分片。
 *
 * text_delta 和 usage 直接从 AgentStreamEvent 派生，保证循环里的
 * `yield chunk` 永远类型安全；turn_end 只给循环自己用，不转发给客户端。
 */
export type ModelStreamChunk =
  | Extract<AgentStreamEvent, { type: 'text_delta' | 'usage' }>
  | {
      type: 'turn_end'
      turn: AssistantTurn
    }

export type ModelRequest = (
  messages: ChatCompletionMessageParam[],
  options: {
    withTools: boolean
  },
  context: AgentRunContext,
) => AsyncIterable<ModelStreamChunk>

type ToolBudget = {
  search: number
  read_page: number
}

/**
 * TODO(owner)：这是仅为通过类型检查而写的最小版本，正式的证据纪律和
 * 动作集约定需要你自己重写（对应 product-plan 阶段 6 的完成条件）。
 */
const agentSystemPrompt = `
你是一个检索助手。你只能执行这些动作：调用 search 搜索、调用 read_page 读取候选页面、
直接回答、或说明某项条件无法确认。

规则：
- 搜索摘要只能作为初筛依据，不能当作对页面全部内容的证明。
- 每个判断都要指出它来自哪个来源；没有来源就输出“无法确认”，不要猜测。
- 工具返回 ok:false 时不要重复同样的调用，换查询或直接说明限制。
`.trim()

function isOkResult(content: string) {
  try {
    return (JSON.parse(content) as { ok?: unknown }).ok === true
  } catch {
    return false
  }
}

/**
 * 扣预算；扣不动时不抛错，而是把拒绝伪装成一条普通 tool 结果还给模型，
 * 让它自己决定是换查询还是直接回答。预算是代码的事，不是 prompt 的事。
 */
function spendToolBudget(budget: ToolBudget, name: string): string | undefined {
  if (name !== 'search' && name !== 'read_page') return undefined // 未知工具交给 executeTool 报错

  if (budget[name] <= 0) {
    return JSON.stringify({
      ok: false,
      error: 'budget_exhausted',
      message: `No ${name} call left. Answer with the evidence you already have.`,
      retryable: false,
    })
  }

  budget[name] -= 1
  return undefined
}

async function* requestDeepSeekStream(
  messages: ChatCompletionMessageParam[],
  options: { withTools: boolean },
  context: AgentRunContext,
): AsyncGenerator<ModelStreamChunk> {
  const stream = await createDeepSeekClient().chat.completions.create(
    {
      model: 'deepseek-v4-flash',
      messages,
      stream: true,
      stream_options: { include_usage: true },
      ...(options.withTools ? { tools: retrievalTools } : {}),
    },
    { signal: context.signal },
  )

  let text = ''
  const partials = new Map<number, { id: string; name: string; arguments: string }>()

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta

    if (delta?.content) {
      text += delta.content
      yield { type: 'text_delta', delta: delta.content }
    }

    for (const toolCallDelta of delta?.tool_calls ?? []) {
      const partial = partials.get(toolCallDelta.index) ?? { id: '', name: '', arguments: '' }

      partial.id ||= toolCallDelta.id ?? ''
      partial.name ||= toolCallDelta.function?.name ?? ''
      partial.arguments += toolCallDelta.function?.arguments ?? ''
      partials.set(toolCallDelta.index, partial)
    }

    if (chunk.usage) {
      yield {
        type: 'usage',
        usage: {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
        },
      }
    }
  }

  yield {
    type: 'turn_end',
    turn: {
      text,
      toolCalls: [...partials.entries()]
        .toSorted(([a], [b]) => a - b)
        .map(([, partial]) => ({
          id: partial.id,
          type: 'function' as const,
          function: { name: partial.name, arguments: partial.arguments },
        })),
    },
  }
}

export async function* askAgentStream(
  messages: ChatMessage[],
  context: AgentRunContext,
  dependencies: { requestModel?: ModelRequest; runTool?: typeof executeTool } = {},
): AsyncGenerator<AgentStreamEvent> {
  const requestModel = dependencies.requestModel ?? requestDeepSeekStream
  const runTool = dependencies.runTool ?? executeTool

  // transcript 是循环自己的账本：tool_calls 和 role:'tool' 只允许由本函数写入。
  const transcript: ChatCompletionMessageParam[] = [
    { role: 'system', content: agentSystemPrompt },
    ...messages.filter((message) => message.role !== 'system'),
  ]
  const budget: ToolBudget = {
    search: agentLimits.maxSearchCalls,
    read_page: agentLimits.maxPageReads,
  }

  for (let round = 1; round <= agentLimits.maxRounds; round++) {
    context.signal.throwIfAborted()

    // 最后一轮不带 tools：模型没有工具可选，循环必然在有限轮内收敛。
    const withTools = round < agentLimits.maxRounds

    let turn: AssistantTurn | undefined

    for await (const chunk of requestModel(transcript, { withTools }, context)) {
      if (chunk.type === 'turn_end') {
        turn = chunk.turn
        continue
      }
      yield chunk
    }

    if (!turn) throw new Error('Model stream ended without a turn')

    // 没有工具调用 = 模型认为可以回答了。这是唯一的正常出口。
    if (turn.toolCalls.length === 0) {
      if (!turn.text.trim()) throw new Error('Model returned an empty answer')
      yield { type: 'done' }
      return
    }

    transcript.push({
      role: 'assistant',
      content: turn.text || null,
      tool_calls: turn.toolCalls,
    })

    // 每个 tool_call.id 必须恰好有一条 tool 消息回应，缺一条下一轮就会 400。
    for (const toolCall of turn.toolCalls) {
      yield {
        type: 'tool_call',
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      }

      const content =
        spendToolBudget(budget, toolCall.function.name) ?? (await runTool(toolCall, context.signal))

      transcript.push({ role: 'tool', tool_call_id: toolCall.id, content })
      yield {
        type: 'tool_result',
        id: toolCall.id,
        name: toolCall.function.name,
        ok: isOkResult(content),
      }
    }
  }

  // 到这里说明最后一轮仍在调工具（模型没按约定行动），显式失败而不是静默结束。
  throw new Error('Agent loop ended without an answer')
}

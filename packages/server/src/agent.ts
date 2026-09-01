import type {
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
} from 'openai/resources/index.mjs'
import type { AgentStreamEvent, ChatMessage, ToolSource } from '@ai-agent-pro/shared/type.js'
import { createDeepSeekClient } from './deepseek-client.js'
import { agentLimits } from './util.js'
import { executeTool } from './tools/execute-tool.js'
import { retrievalTools } from './tools/retrieval-tools.js'

export type AgentRunContext = {
  signal: AbortSignal
}

export type AssistantTurn = {
  text: string
  /** 这一轮的思维链。带 tools 请求时必须原样发回去，见 assistantMessage */
  reasoning: string
  toolCalls: ChatCompletionMessageFunctionToolCall[]
}

/**
 * 模型流的分片。
 *
 * text_delta、reasoning_delta 和 usage 直接从 AgentStreamEvent 派生，保证循环里的
 * `yield chunk` 永远类型安全；turn_end 只给循环自己用，不转发给客户端。
 */
export type ModelStreamChunk =
  | Extract<AgentStreamEvent, { type: 'text_delta' | 'reasoning_delta' | 'usage' }>
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
 * DeepSeek 的思考模式开关。OpenAI 的参数类型里没有它，交叉进请求体而不是
 * 就地断言：这样多出来的字段仍然受类型检查，写错名字编译期就会发现。
 */
type ThinkingParams = {
  thinking: { type: 'enabled' | 'disabled' }
}

/**
 * 带 tools 的请求必须把上一轮的 reasoning_content 一起发回去，少一条 DeepSeek 直接 400。
 * OpenAI 的消息类型里同样没有这个字段，所以在这里补上。
 */
type AssistantMessage = Extract<ChatCompletionMessageParam, { role: 'assistant' }> & {
  reasoning_content?: string
}

/** 界面上那行摘要最多这么长——再长也只是把工具链的排版撑破 */
const TOOL_PREVIEW_MAX_LENGTH = 120

/*
 * 上线的命中数和每条的长度上限。
 *
 * 五条是 Tavily 单次的上限，也刚好是一屏能扫完的量；标题和摘要裁到这个长度，
 * 一次搜索的结果加起来约 1.5 KB——够判断值不值得点开，又不至于把整份摘要搬过去。
 */
const TOOL_SOURCE_MAX_COUNT = 5
const TOOL_SOURCE_TITLE_MAX_LENGTH = 120
const TOOL_SOURCE_SNIPPET_MAX_LENGTH = 160

/**
 * 失败原因给人看的说法。
 *
 * 工具返回的 error 码和 message 是写给模型的（英文、固定措辞），直接摆到时间轴上
 * 就是一句 "budget_exhausted · No search call left."——用户读不出这是产品的限额。
 * 所以这里把已知的失败翻一遍；未知的码保持原样，出了新错误不会被吞掉。
 */
const toolErrorPreview: Record<string, string> = {
  invalid_tool_arguments: '参数不合法',
  budget_exhausted: '这一次检索的调用次数已用完',
  rate_limited: '被提供方限流',
  tool_unavailable: '工具不可用',
  provider_error: '提供方请求失败',
  unknown_tool: '未知工具',
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function condense(value: string, maxLength = TOOL_PREVIEW_MAX_LENGTH) {
  const collapsed = value.replace(/\s+/g, ' ').trim()

  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength - 1)}…` : collapsed
}

/**
 * 把搜索结果读成界面上那份来源列表。
 *
 * 没有 url 的一条直接丢掉：界面上它既点不开，也无从判断是哪个站说的，
 * 留着只是占一个名额。裁剪在服务端做，客户端拿到的就是能直接渲染的形状。
 */
function readSources(results: unknown[]): ToolSource[] {
  return results
    .flatMap((result) => {
      if (!isRecord(result)) return []

      const url = typeof result.url === 'string' ? result.url : ''

      if (!url) return []

      return [
        {
          url,
          title: condense(
            typeof result.title === 'string' ? result.title : '',
            TOOL_SOURCE_TITLE_MAX_LENGTH,
          ),
          snippet: condense(
            typeof result.snippet === 'string' ? result.snippet : '',
            TOOL_SOURCE_SNIPPET_MAX_LENGTH,
          ),
        },
      ]
    })
    .slice(0, TOOL_SOURCE_MAX_COUNT)
}

/**
 * 把工具结果读成界面要的几件事：成没成、拿回了什么，以及搜到了哪些来源。
 *
 * read_page 的完整正文只留在服务端的账本里——一次能带回两万字符，原样推到前端
 * 既没人看得完，也等于把证据变成了客户端手里的数据。所以这里只提炼摘要：
 * 搜到几条、读到多少字、失败的话是哪种失败；search 的命中额外给一份裁剪过的来源列表。
 */
function readToolOutcome(content: string): {
  ok: boolean
  preview?: string
  sources?: ToolSource[]
} {
  let parsed: unknown

  try {
    parsed = JSON.parse(content)
  } catch {
    return { ok: false }
  }

  if (!isRecord(parsed)) return { ok: false }

  const ok = parsed.ok === true

  if (!ok) {
    const error = typeof parsed.error === 'string' ? parsed.error : 'unknown_error'
    const label = toolErrorPreview[error]

    if (label) return { ok, preview: label }

    const message = typeof parsed.message === 'string' ? parsed.message : ''

    return { ok, preview: condense(message ? `${error} · ${message}` : error) }
  }

  // search：几条结果 + 前几个标题
  if (Array.isArray(parsed.results)) {
    const count = parsed.results.length

    if (count === 0) return { ok, preview: '没有命中' }

    // 标题是提供方给的，不一定有；条数才是"这一步拿回了什么"的下限
    const titles = parsed.results
      .map((result) => (isRecord(result) && typeof result.title === 'string' ? result.title : ''))
      .filter(Boolean)

    return {
      ok,
      preview: condense(titles.length > 0 ? `${count} 条 · ${titles.join(' · ')}` : `${count} 条`),
      sources: readSources(parsed.results),
    }
  }

  // read_page：读到多少字 + 正文开头，让人看得出这页到底是什么
  if (isRecord(parsed.result) && typeof parsed.result.content === 'string') {
    const { content: pageContent, truncated } = parsed.result
    const size = `${pageContent.length} 字符${truncated === true ? '（截断）' : ''}`

    return { ok, preview: condense(`${size} · ${pageContent}`) }
  }

  return { ok }
}

/** DeepSeek 在 delta 上多挂一个 reasoning_content，OpenAI 的类型里没有这个字段 */
function readReasoningDelta(delta: unknown): string {
  if (!isRecord(delta)) return ''

  const reasoning = delta.reasoning_content

  return typeof reasoning === 'string' ? reasoning : ''
}

/**
 * 把一次工具执行的成败都变成值。
 *
 * 一轮里的调用是并行起飞的：如果直接 `await` 第一个而它 reject（取消时全部都会），
 * 同轮其他 promise 就没人接手，Node 会按 unhandled rejection 处理。
 */
async function settleToolCall(
  run: () => Promise<string>,
): Promise<{ content: string } | { failure: unknown }> {
  try {
    return { content: await run() }
  } catch (failure: unknown) {
    return { failure }
  }
}

/**
 * 扣预算；扣不动时不抛错，而是把拒绝伪装成一条普通 tool 结果还给模型，
 * 让它自己决定是换查询还是直接回答。预算是代码的事，不是 prompt 的事。
 */
function spendToolBudget(budget: ToolBudget, name: string): string | undefined {
  if (name !== 'search' && name !== 'read_page') return undefined // 未知工具交给 executeTool 报错

  if (budget[name] <= 0) {
    const other = name === 'search' ? 'read_page' : 'search'

    // 告诉它另一种工具还剩多少：预算用尽不等于无路可走，常常是"别再搜了，去读页面"。
    return JSON.stringify({
      ok: false,
      error: 'budget_exhausted',
      message: `No ${name} call left in this run. ${budget[other]} ${other} call(s) remain. Do not retry ${name}; use what you have.`,
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
  const body: ChatCompletionCreateParamsStreaming & ThinkingParams = {
    model: 'deepseek-v4-flash',
    messages,
    stream: true,
    stream_options: { include_usage: true },
    // v4 默认就开着，但写出来才说得清这个循环依赖它：思维链是界面上"这一轮在想什么"的唯一来源
    thinking: { type: 'enabled' },
    ...(options.withTools ? { tools: retrievalTools } : {}),
  }
  const stream = await createDeepSeekClient().chat.completions.create(body, {
    signal: context.signal,
  })

  let text = ''
  let reasoning = ''
  const partials = new Map<number, { id: string; name: string; arguments: string }>()

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta
    const reasoningDelta = readReasoningDelta(delta)

    // 思维链整段走在正文前面，所以先转发它，客户端看到的顺序才和模型的顺序一致
    if (reasoningDelta) {
      reasoning += reasoningDelta
      yield { type: 'reasoning_delta', delta: reasoningDelta }
    }

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
      reasoning,
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
    yield { type: 'round_start', round }

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

    const assistantMessage: AssistantMessage = {
      role: 'assistant',
      content: turn.text || null,
      tool_calls: turn.toolCalls,
    }

    // 思考模式下，带 tools 的请求要求每条 assistant.tool_calls 都配着它的 reasoning_content。
    // 漏掉这一条，下一轮就是 400——所以这个字段是协议要求，不是给人看的附赠品。
    if (turn.reasoning) assistantMessage.reasoning_content = turn.reasoning

    transcript.push(assistantMessage)

    // 模型一轮里常常并行发多个调用（两次 search、两次 read_page）。串行执行会把
    // 两个 12s 超时叠成 24s，所以这里先让它们全部起飞，再按原顺序收结果。
    // 预算在起飞前按顺序扣，扣的结果才不依赖谁先返回。
    const executions = turn.toolCalls.map((toolCall) => {
      const rejection = spendToolBudget(budget, toolCall.function.name)

      return {
        toolCall,
        // 预算不足时不发请求，但仍然要占一条 tool 消息。
        outcome: settleToolCall(() =>
          rejection === undefined ? runTool(toolCall, context.signal) : Promise.resolve(rejection),
        ),
      }
    })

    for (const { toolCall } of executions) {
      yield {
        type: 'tool_call',
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      }
    }

    // 每个 tool_call.id 必须恰好有一条 tool 消息回应，缺一条下一轮就会 400。
    for (const { toolCall, outcome } of executions) {
      const settled = await outcome

      if (!('content' in settled)) throw settled.failure

      const { ok, preview, sources } = readToolOutcome(settled.content)

      transcript.push({ role: 'tool', tool_call_id: toolCall.id, content: settled.content })
      yield {
        type: 'tool_result',
        id: toolCall.id,
        name: toolCall.function.name,
        ok,
        ...(preview ? { preview } : {}),
        ...(sources && sources.length > 0 ? { sources } : {}),
      }
    }
  }

  // 到这里说明最后一轮仍在调工具（模型没按约定行动），显式失败而不是静默结束。
  throw new Error('Agent loop ended without an answer')
}

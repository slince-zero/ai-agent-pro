import type {
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
} from 'openai/resources/index.mjs'
import type { AgentStreamEvent, ChatMessage } from '@ai-agent-pro/shared/type.js'
import { createDeepSeekClient } from './deepseek-client.js'
import { agentLimits } from './util.js'
import {
  createRetrievalLedger,
  ledgerEvidence,
  projectContext,
  recordMessage,
  recordToolResult,
  setLedgerIntent,
} from './context/retrieval-ledger.js'
import type { RunStatus } from './context/retrieval-ledger.js'
import { buildSearchQueries } from './retrieval/build-search-queries.js'
import type { RetrievalIntent } from './retrieval/retrieval-intent.js'
import { executeTool } from './tools/execute-tool.js'
import { retrievalTools } from './tools/retrieval-tools.js'

export type AgentRunContext = {
  signal: AbortSignal
}

/**
 * 把用户的话解析成结构化检索意图。
 *
 * 由调用方注入而不是在这里给默认值：它是一次额外的模型请求，默认接上就意味着
 * 每个测试都得先把网络挡掉。app.ts 作为组装点决定用不用它。
 */
export type IntentExtractor = (input: string, signal: AbortSignal) => Promise<RetrievalIntent>

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

/**
 * 循环的行为约定。
 *
 * 三件事必须写在这里而不是留给模型自己发挥：动作集（只有四个动作，没有"再想想"）、
 * 证据纪律（摘要只做初筛，断言要有正文），以及引用怎么写。引用格式是有依赖的——
 * 工具结果里那个 ref 由服务端账本发号，界面靠同一个号把答案里的 [1] 连回来源，
 * 所以模型只能用真出现过的号，不能自己编。
 *
 * "读完一页先写一句结论"那条不是文风要求：正文会在后续轮次里被上下文预算挤成摘录，
 * 它自己写下的那句话是唯一留得住的东西。
 */
const agentSystemPrompt = `
你是一个检索助手。你只有四个动作：调用 search 搜索、调用 read_page 读取页面、给出答案、
说明某个条件无法确认。除此之外什么都不要做。

怎么用工具
- 互不依赖的子问题在同一轮里一起发出去，不要拆成好几轮来回。
- 每条工具结果都带 budget 和 rounds_left，那是这一次运行的硬上限。快用完时先回答，
  不要赌下一轮还来得及。
- 结果 ok 为 false 时不要重复同样的调用：换查询、换地址，或者说明这一条无法确认。

证据纪律
- search 给的 snippet 只能用来判断"这一页值不值得打开"，不能当作页面内容的证明。
- 具体断言（版本号、许可证、价格、时间、有没有某个功能）必须有 read_page 读回的正文支持。
- 每读完一页，先用一两句话写下它对哪个条件给出了什么结论，再继续下一步。
- 工具结果里出现 note 字段，说明那一页的正文已经不在上下文里了。不要重新读同一个地址，
  用你之前写下的结论。

引用
- 每个来源在工具结果里都带一个 ref 数字。正文里用 [ref] 标注，例如 [1]。
- 只能用工具结果里真出现过的 ref，不要自己编号，也不要在答案里写裸链接。
- 一句话有多个来源时写成 [1][3]。

回答格式
先正面回答问题，再给一段"条件核对"，把用户提出的每个条件逐条列出来：
- 已确认：条件 —— 结论 [ref]
- 不满足：条件 —— 结论 [ref]
- 无法确认：条件 —— 缺哪一份证据
没有来源支持的条件一律进"无法确认"，不要猜，也不要用常识补齐。
`.trim()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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

/**
 * 把结构化意图渲染成跟在 system prompt 后面的一段话。
 *
 * 它的用处不只是"复述一遍用户想干什么"：hardConstraints 和 exclusions 会变成
 * 条件核对那一段要逐条回答的清单。没有这份清单，"逐条列出用户提出的每个条件"
 * 就得靠模型自己从原话里数，数漏了也没人发现。
 */
function renderIntent(intent: RetrievalIntent): string {
  const queries = buildSearchQueries(intent)

  return [
    '这一次的检索意图（上一步从用户原话解析出来的，和原话冲突时以原话为准）：',
    `- 目标：${intent.target}`,
    ...(intent.contentType ? [`- 内容类型：${intent.contentType}`] : []),
    ...(intent.hardConstraints.length > 0
      ? [`- 必须满足：${intent.hardConstraints.join('；')}`]
      : []),
    ...(intent.exclusions.length > 0 ? [`- 必须排除：${intent.exclusions.join('；')}`] : []),
    ...(intent.preferences.length > 0
      ? [`- 偏好（不是硬条件，不要当成必须满足）：${intent.preferences.join('；')}`]
      : []),
    ...(intent.language ? [`- 语言：${intent.language}`] : []),
    ...(intent.timeRange ? [`- 时间范围：${intent.timeRange}`] : []),
    ...(intent.ambiguities.length > 0 ? [`- 待澄清：${intent.ambiguities.join('；')}`] : []),
    ...(queries.length > 0 ? [`起手查询可以从这些开始：${queries.join(' ｜ ')}`] : []),
    '条件核对要逐条覆盖上面"必须满足"和"必须排除"里的每一项。',
  ].join('\n')
}

/**
 * 解析意图；失败就当没有这一步。
 *
 * 这是一次锦上添花的额外模型请求，解析不出来不该让整次提问失败——循环没有它
 * 也照样能跑。取消同样在这里被吞掉，由循环自己的 throwIfAborted 统一负责。
 */
async function settleIntent(
  extract: IntentExtractor,
  input: string,
  signal: AbortSignal,
): Promise<RetrievalIntent | undefined> {
  try {
    return await extract(input, signal)
  } catch {
    return undefined
  }
}

/**
 * 只有第一句提问才拿去解析意图。
 *
 * 解析器接的是一句话。追问（"那 Coze 呢"）单独拿出来解析只会得到一份跑偏的意图，
 * 还会盖掉前面已经谈定的条件；这种时候历史消息本身就是上下文，不需要再提炼一遍。
 */
function readInitialQuestion(messages: ChatMessage[]) {
  const [only] = messages

  return messages.length === 1 && only?.role === 'user' ? only.content.trim() : ''
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
  dependencies: {
    requestModel?: ModelRequest
    runTool?: typeof executeTool
    extractIntent?: IntentExtractor
  } = {},
): AsyncGenerator<AgentStreamEvent> {
  const requestModel = dependencies.requestModel ?? requestDeepSeekStream
  const runTool = dependencies.runTool ?? executeTool
  const history = messages.filter((message) => message.role !== 'system')

  // 账本归循环所有：tool 结果、引用编号、上下文预算都只允许由这里写入。
  const ledger = createRetrievalLedger(agentSystemPrompt, history)
  const budget: ToolBudget = {
    search: agentLimits.maxSearchCalls,
    read_page: agentLimits.maxPageReads,
  }
  const question = dependencies.extractIntent ? readInitialQuestion(history) : ''

  /*
   * 意图解析排在第一轮之前，这一两秒是有代价的：用户要多等一会儿才看到第一个字。
   * 换来的是第一次搜索就带上硬条件——搜偏一次要重来一整轮，那是四五秒。
   */
  if (dependencies.extractIntent && question) {
    const intent = await settleIntent(dependencies.extractIntent, question, context.signal)

    if (intent) setLedgerIntent(ledger, renderIntent(intent))
  }

  for (let round = 1; round <= agentLimits.maxRounds; round++) {
    context.signal.throwIfAborted()
    yield { type: 'round_start', round }

    // 最后一轮不带 tools：模型没有工具可选，循环必然在有限轮内收敛。
    const withTools = round < agentLimits.maxRounds

    let turn: AssistantTurn | undefined

    for await (const chunk of requestModel(projectContext(ledger), { withTools }, context)) {
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

      const sources = ledgerEvidence(ledger)

      // 一条来源都没有的时候不发这个事件：答案下面挂一份空清单只是噪音。
      if (sources.length > 0) yield { type: 'evidence', sources }

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

    recordMessage(ledger, assistantMessage)

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

    /*
     * 跟着结果一起告诉模型"这一步之后还剩多少"。
     *
     * 预算在上面已经扣完了，所以这里读到的就是同一轮所有调用之后的余量：
     * 一轮里并行发了三次搜索，三条结果上写的都是扣掉三次之后的数，这是对的——
     * 它下一次决策时面对的正是这个余量。
     */
    const status: RunStatus = {
      roundsLeft: Math.max(agentLimits.maxRounds - 1 - round, 0),
      searchLeft: budget.search,
      pageLeft: budget.read_page,
    }

    // 每个 tool_call.id 必须恰好有一条 tool 消息回应，缺一条下一轮就会 400。
    for (const { toolCall, outcome } of executions) {
      const settled = await outcome

      if (!('content' in settled)) throw settled.failure

      const { ok, preview, sources } = recordToolResult(ledger, {
        toolCall,
        content: settled.content,
        status,
      })

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

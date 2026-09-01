import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
} from 'openai/resources/index.mjs'
import type { AgentStreamEvent, ChatMessage, TokenUsage } from '@ai-agent-pro/shared/type.js'
import { askAgentStream } from './agent.js'
import type { AgentRunContext, ModelRequest, ModelStreamChunk } from './agent.js'
import type { RetrievalIntent } from './retrieval/retrieval-intent.js'
import { agentLimits } from './util.js'

const messages: ChatMessage[] = [{ role: 'user', content: 'What is an agent?' }]
const usage: TokenUsage = { inputTokens: 10, outputTokens: 12, totalTokens: 22 }
const intent: RetrievalIntent = {
  target: 'Agent 教程',
  contentType: '教程',
  hardConstraints: ['包含完整示例'],
  exclusions: ['只讲框架用法'],
  preferences: ['TypeScript'],
  ambiguities: [],
  language: '中文',
  timeRange: null,
}

type ScriptedCall = { id: string; name: string; arguments: string }
type ScriptedTurn = { text: string; reasoning?: string; toolCalls?: ScriptedCall[] }
type ToolMessage = Extract<ChatCompletionMessageParam, { role: 'tool' }>
type AssistantMessage = Extract<ChatCompletionMessageParam, { role: 'assistant' }> & {
  reasoning_content?: string
}

async function collectEvents(events: AsyncIterable<AgentStreamEvent>) {
  const result: AgentStreamEvent[] = []

  for await (const event of events) {
    result.push(event)
  }

  return result
}

function pickEvents<Type extends AgentStreamEvent['type']>(
  events: AgentStreamEvent[],
  type: Type,
): Array<Extract<AgentStreamEvent, { type: Type }>> {
  return events.filter(
    (event): event is Extract<AgentStreamEvent, { type: Type }> => event.type === type,
  )
}

function toolMessages(transcript: ChatCompletionMessageParam[]) {
  return transcript.filter((message): message is ToolMessage => message.role === 'tool')
}

function assistantMessages(transcript: ChatCompletionMessageParam[]) {
  return transcript.filter((message): message is AssistantMessage => message.role === 'assistant')
}

function searchQueries(seen: ChatCompletionMessageFunctionToolCall[]) {
  return seen.map(
    (toolCall) => (JSON.parse(toolCall.function.arguments) as { query: string }).query,
  )
}

function toToolCall(call: ScriptedCall): ChatCompletionMessageFunctionToolCall {
  return { id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } }
}

/**
 * 按剧本回放模型输出，并快照每轮看到的 transcript。
 *
 * 剧本用尽后重复最后一轮，这样"模型一直调工具"只要写一条剧本。
 */
function scriptModel(turns: ScriptedTurn[]) {
  const calls: Array<{ transcript: ChatCompletionMessageParam[]; withTools: boolean }> = []

  const requestModel: ModelRequest = async function* (transcript, options) {
    // transcript 是循环复用的同一个数组，必须快照才能事后断言每轮看到了什么。
    calls.push({ transcript: structuredClone(transcript), withTools: options.withTools })

    const turn = turns[Math.min(calls.length - 1, turns.length - 1)]
    if (!turn) throw new Error('scriptModel needs at least one turn')

    if (turn.reasoning) yield { type: 'reasoning_delta', delta: turn.reasoning }
    if (turn.text) yield { type: 'text_delta', delta: turn.text }
    yield {
      type: 'turn_end',
      turn: {
        text: turn.text,
        reasoning: turn.reasoning ?? '',
        toolCalls: (turn.toolCalls ?? []).map(toToolCall),
      },
    }
  }

  return { requestModel, calls }
}

function scriptTools(
  reply: (toolCall: ChatCompletionMessageFunctionToolCall) => Promise<string> | string,
) {
  const seen: ChatCompletionMessageFunctionToolCall[] = []

  async function runTool(toolCall: ChatCompletionMessageFunctionToolCall) {
    seen.push(toolCall)
    return reply(toolCall)
  }

  return { runTool, seen }
}

function searchTurn(id: string): ScriptedTurn {
  return { text: '', toolCalls: [{ id, name: 'search', arguments: `{"query":"${id}"}` }] }
}

async function* failingRequestModel(): AsyncGenerator<never> {
  yield* []
  throw new Error('network failed')
}

async function* turnlessRequestModel(): AsyncGenerator<ModelStreamChunk> {
  yield { type: 'text_delta', delta: 'partial answer' }
}

test('answers without tools and appends done', async () => {
  const controller = new AbortController()

  async function* requestModel(
    transcript: ChatCompletionMessageParam[],
    options: { withTools: boolean },
    context: AgentRunContext,
  ): AsyncGenerator<ModelStreamChunk> {
    // system prompt 由循环写入，客户端消息接在它后面。
    assert.equal(transcript[0]?.role, 'system')
    assert.deepEqual(transcript.slice(1), messages)
    assert.equal(options.withTools, true)
    assert.equal(context.signal, controller.signal)

    yield { type: 'text_delta', delta: 'An agent can ' }
    yield { type: 'text_delta', delta: 'use tools.' }
    yield { type: 'usage', usage }
    yield {
      type: 'turn_end',
      turn: { text: 'An agent can use tools.', reasoning: '', toolCalls: [] },
    }
  }

  const result = await collectEvents(
    askAgentStream(messages, { signal: controller.signal }, { requestModel }),
  )

  // turn_end 是循环的内部分片，不应该出现在客户端事件流里。
  assert.deepEqual(result, [
    { type: 'round_start', round: 1 },
    { type: 'text_delta', delta: 'An agent can ' },
    { type: 'text_delta', delta: 'use tools.' },
    { type: 'usage', usage },
    { type: 'done' },
  ])
})

test('rejects an empty model answer', async () => {
  const controller = new AbortController()

  async function* requestModel(): AsyncGenerator<ModelStreamChunk> {
    yield { type: 'text_delta', delta: '   ' }
    yield { type: 'usage', usage }
    yield { type: 'turn_end', turn: { text: '   ', reasoning: '', toolCalls: [] } }
  }

  await assert.rejects(
    collectEvents(askAgentStream(messages, { signal: controller.signal }, { requestModel })),
    /Model returned an empty answer/,
  )
})

test('rejects a model stream that never ends its turn', async () => {
  const controller = new AbortController()

  await assert.rejects(
    collectEvents(
      askAgentStream(
        messages,
        { signal: controller.signal },
        { requestModel: turnlessRequestModel },
      ),
    ),
    /Model stream ended without a turn/,
  )
})

test('passes model request failures to the caller', async () => {
  const controller = new AbortController()

  await assert.rejects(
    collectEvents(
      askAgentStream(
        messages,
        { signal: controller.signal },
        { requestModel: failingRequestModel },
      ),
    ),
    /network failed/,
  )
})

test('forwards cancellation to the model stream without appending done', async () => {
  const controller = new AbortController()

  async function* requestModel(
    _transcript: ChatCompletionMessageParam[],
    _options: { withTools: boolean },
    context: AgentRunContext,
  ): AsyncGenerator<ModelStreamChunk> {
    assert.equal(context.signal, controller.signal)
    yield { type: 'text_delta', delta: 'partial answer' }

    await new Promise<never>((_resolve, reject) => {
      const rejectAbort = () => reject(new Error('aborted'))

      if (context.signal.aborted) {
        rejectAbort()
        return
      }

      context.signal.addEventListener('abort', rejectAbort, { once: true })
    })
  }

  const stream = askAgentStream(messages, { signal: controller.signal }, { requestModel })

  assert.deepEqual(await stream.next(), {
    value: { type: 'round_start', round: 1 },
    done: false,
  })
  assert.deepEqual(await stream.next(), {
    value: { type: 'text_delta', delta: 'partial answer' },
    done: false,
  })

  controller.abort()

  await assert.rejects(stream.next(), /aborted/)
})

test('searches once and then answers', async () => {
  const controller = new AbortController()
  const { requestModel, calls } = scriptModel([
    {
      text: '我先搜一下。',
      toolCalls: [{ id: 'call_1', name: 'search', arguments: '{"query":"ts agent"}' }],
    },
    { text: '这里是答案。' },
  ])
  const { runTool, seen } = scriptTools(() =>
    JSON.stringify({ ok: true, results: [{ url: 'https://example.com' }] }),
  )

  const events = await collectEvents(
    askAgentStream(messages, { signal: controller.signal }, { requestModel, runTool }),
  )

  assert.deepEqual(events, [
    { type: 'round_start', round: 1 },
    { type: 'text_delta', delta: '我先搜一下。' },
    { type: 'tool_call', id: 'call_1', name: 'search', arguments: '{"query":"ts agent"}' },
    {
      type: 'tool_result',
      id: 'call_1',
      name: 'search',
      ok: true,
      preview: '1 条',
      // 搜索的命中随结果一起上线，界面才能在展开时给出这一次到底搜到了什么
      sources: [{ ref: 1, url: 'https://example.com', title: '', snippet: '' }],
    },
    { type: 'round_start', round: 2 },
    { type: 'text_delta', delta: '这里是答案。' },
    // 收尾时一次给全来源：答案里的 [1] 要能点开，客户端就得有编号到地址的映射
    {
      type: 'evidence',
      sources: [{ ref: 1, url: 'https://example.com', title: '', snippet: '', read: false }],
    },
    { type: 'done' },
  ])
  assert.equal(seen.length, 1)

  // 第二轮的 transcript 必须带上 assistant.tool_calls 和配套的 tool 消息。
  const secondRound = calls[1]?.transcript ?? []
  assert.deepEqual(
    secondRound.map((message) => message.role),
    ['system', 'user', 'assistant', 'tool'],
  )
  assert.deepEqual(
    toolMessages(secondRound).map((message) => message.tool_call_id),
    ['call_1'],
  )
})

test('runs a round of tool calls concurrently in model order', { timeout: 5000 }, async () => {
  const controller = new AbortController()
  const { requestModel, calls } = scriptModel([
    {
      text: '',
      toolCalls: [
        { id: 'call_first', name: 'read_page', arguments: '{"url":"https://a.example"}' },
        { id: 'call_second', name: 'read_page', arguments: '{"url":"https://b.example"}' },
      ],
    },
    { text: '两页都读完了。' },
  ])

  const started: string[] = []
  const completed: string[] = []
  let announceBothStarted: (() => void) | undefined
  const bothStarted = new Promise<void>((resolve) => {
    announceBothStarted = resolve
  })

  const { runTool } = scriptTools(async (toolCall) => {
    started.push(toolCall.id)
    if (started.length === 2) announceBothStarted?.()

    // 串行执行会一直卡在这里，直到测试超时——这正是想要的失败信号。
    await bothStarted
    // 让后发的调用先返回，证明顺序来自模型而不是完成时间。
    if (toolCall.id === 'call_first') await new Promise((resolve) => setTimeout(resolve, 10))

    completed.push(toolCall.id)
    return JSON.stringify({ ok: true, id: toolCall.id })
  })

  const events = await collectEvents(
    askAgentStream(messages, { signal: controller.signal }, { requestModel, runTool }),
  )

  assert.deepEqual(started, ['call_first', 'call_second'])
  assert.deepEqual(completed, ['call_second', 'call_first'])

  // 两个 tool_call 事件先一起发出，客户端才能同时点亮两个调用。
  assert.deepEqual(events.map((event) => event.type).slice(0, 4), [
    'round_start',
    'tool_call',
    'tool_call',
    'tool_result',
  ])
  assert.deepEqual(
    pickEvents(events, 'tool_result').map((event) => event.id),
    ['call_first', 'call_second'],
  )
  assert.deepEqual(
    toolMessages(calls[1]?.transcript ?? []).map((message) => message.tool_call_id),
    ['call_first', 'call_second'],
  )
})

test('adjusts the query when the first search finds nothing', async () => {
  const controller = new AbortController()
  const { requestModel, calls } = scriptModel([
    { text: '', toolCalls: [{ id: 'call_1', name: 'search', arguments: '{"query":"ts agent"}' }] },
    {
      text: '换个说法再搜。',
      toolCalls: [{ id: 'call_2', name: 'search', arguments: '{"query":"typescript agent 入门"}' }],
    },
    { text: '找到了合格的来源。' },
  ])
  const { runTool, seen } = scriptTools((toolCall) =>
    JSON.stringify({
      ok: true,
      results: toolCall.id === 'call_1' ? [] : [{ url: 'https://example.com' }],
    }),
  )

  const events = await collectEvents(
    askAgentStream(messages, { signal: controller.signal }, { requestModel, runTool }),
  )

  assert.deepEqual(searchQueries(seen), ['ts agent', 'typescript agent 入门'])
  assert.equal(calls.length, 3)
  assert.deepEqual(events.at(-1), { type: 'done' })
})

test('reports failed tool results without ending the run', async () => {
  const controller = new AbortController()
  const { requestModel } = scriptModel([
    { text: '', toolCalls: [{ id: 'call_1', name: 'search', arguments: '{}' }] },
    {
      text: '',
      toolCalls: [{ id: 'call_2', name: 'read_page', arguments: '{"url":"https://a.example"}' }],
    },
    { text: '在可用证据范围内回答。' },
  ])
  const { runTool } = scriptTools((toolCall) =>
    toolCall.id === 'call_1'
      ? JSON.stringify({
          ok: false,
          error: 'invalid_tool_arguments',
          issues: [{ path: 'query', message: 'Required' }],
        })
      : JSON.stringify({ ok: false, error: 'provider_error', retryable: true }),
  )

  const events = await collectEvents(
    askAgentStream(messages, { signal: controller.signal }, { requestModel, runTool }),
  )

  assert.deepEqual(
    pickEvents(events, 'tool_result').map((event) => event.ok),
    [false, false],
  )
  assert.deepEqual(events.at(-1), { type: 'done' })
})

test('stops honestly when no candidate qualifies', async () => {
  const controller = new AbortController()
  const { requestModel } = scriptModel([
    { text: '', toolCalls: [{ id: 'call_1', name: 'search', arguments: '{"query":"ts agent"}' }] },
    { text: '无法确认：没有来源同时满足这些条件。' },
  ])
  const { runTool } = scriptTools(() => JSON.stringify({ ok: true, results: [] }))

  const events = await collectEvents(
    askAgentStream(messages, { signal: controller.signal }, { requestModel, runTool }),
  )

  assert.match(
    pickEvents(events, 'text_delta')
      .map((event) => event.delta)
      .join(''),
    /无法确认/,
  )
  assert.deepEqual(events.at(-1), { type: 'done' })
})

test('fails when the loop reaches the round limit', async () => {
  const controller = new AbortController()
  const { requestModel, calls } = scriptModel([searchTurn('call_loop')])
  const { runTool } = scriptTools(() => JSON.stringify({ ok: true, results: [] }))

  await assert.rejects(
    collectEvents(
      askAgentStream(messages, { signal: controller.signal }, { requestModel, runTool }),
    ),
    /Agent loop ended without an answer/,
  )

  assert.equal(calls.length, agentLimits.maxRounds)
  // 只有最后一轮不带 tools，模型没有工具可选，循环必然收敛。
  assert.equal(calls.at(-1)?.withTools, false)
  assert.equal(calls.filter((call) => call.withTools).length, agentLimits.maxRounds - 1)
})

test('refuses tool calls once the search budget is spent', async () => {
  const controller = new AbortController()
  /*
   * 预算是这样被耗尽的：一轮里并行发出比预算多一次的搜索。
   * "对比这五个框架"就长这样——真实的越界发生在同一轮内部，不是攒够很多轮才发生。
   */
  const overBudgetCalls = Array.from(
    { length: agentLimits.maxSearchCalls + 1 },
    (_value, index) => ({
      id: `call_${index + 1}`,
      name: 'search',
      arguments: `{"query":"q${index + 1}"}`,
    }),
  )
  const { requestModel, calls } = scriptModel([
    { text: '', toolCalls: overBudgetCalls },
    { text: '用已有证据回答。' },
  ])
  const { runTool, seen } = scriptTools(() => JSON.stringify({ ok: true, results: [] }))

  const events = await collectEvents(
    askAgentStream(messages, { signal: controller.signal }, { requestModel, runTool }),
  )

  // 预算用尽后不再真的发请求，但仍然要回一条 tool 消息，否则下一轮就会 400。
  assert.equal(seen.length, agentLimits.maxSearchCalls)
  assert.deepEqual(
    pickEvents(events, 'tool_result').map((event) => event.ok),
    [...Array.from({ length: agentLimits.maxSearchCalls }, () => true), false],
  )

  const refusal = toolMessages(calls.at(-1)?.transcript ?? []).at(-1)
  assert.equal(typeof refusal?.content, 'string')
  assert.match(String(refusal?.content), /budget_exhausted/)
  assert.deepEqual(events.at(-1), { type: 'done' })
})

test('answers every tool_call id with exactly one tool message', async () => {
  const controller = new AbortController()
  const { requestModel, calls } = scriptModel([
    {
      text: '',
      toolCalls: [
        { id: 'call_a', name: 'search', arguments: '{"query":"a"}' },
        { id: 'call_b', name: 'search', arguments: '{"query":"b"}' },
      ],
    },
    {
      text: '',
      toolCalls: [{ id: 'call_c', name: 'read_page', arguments: '{"url":"https://c.example"}' }],
    },
    { text: '答案。' },
  ])
  const { runTool } = scriptTools(() => JSON.stringify({ ok: true, results: [] }))

  const events = await collectEvents(
    askAgentStream(messages, { signal: controller.signal }, { requestModel, runTool }),
  )

  const requestedIds = pickEvents(events, 'tool_call').map((event) => event.id)
  assert.deepEqual(requestedIds, ['call_a', 'call_b', 'call_c'])
  assert.deepEqual(
    toolMessages(calls.at(-1)?.transcript ?? []).map((message) => message.tool_call_id),
    requestedIds,
  )
})

test('forwards reasoning as its own channel, ahead of the text', async () => {
  const controller = new AbortController()
  const { requestModel } = scriptModel([
    {
      reasoning: '先想清楚要搜什么。',
      text: '',
      toolCalls: [{ id: 'call_1', name: 'search', arguments: '{"query":"a"}' }],
    },
    { reasoning: '证据够了。', text: '答案。' },
  ])
  const { runTool } = scriptTools(() => JSON.stringify({ ok: true, results: [] }))

  const events = await collectEvents(
    askAgentStream(messages, { signal: controller.signal }, { requestModel, runTool }),
  )

  // 思维链和正文分成两种事件，客户端才能把推理和答案放在不同的地方
  assert.deepEqual(
    events.map((event) => event.type),
    [
      'round_start',
      'reasoning_delta',
      'tool_call',
      'tool_result',
      'round_start',
      'reasoning_delta',
      'text_delta',
      'done',
    ],
  )
  assert.deepEqual(
    pickEvents(events, 'reasoning_delta').map((event) => event.delta),
    ['先想清楚要搜什么。', '证据够了。'],
  )
})

test('sends each turn reasoning back with its tool calls', async () => {
  const controller = new AbortController()
  const { requestModel, calls } = scriptModel([
    {
      reasoning: '这一轮的推理。',
      text: '',
      toolCalls: [{ id: 'call_1', name: 'search', arguments: '{"query":"a"}' }],
    },
    { reasoning: '', text: '答案。' },
  ])
  const { runTool } = scriptTools(() => JSON.stringify({ ok: true, results: [] }))

  await collectEvents(
    askAgentStream(messages, { signal: controller.signal }, { requestModel, runTool }),
  )

  /*
   * 思考模式下带 tools 的请求要求每条 assistant.tool_calls 都配着自己的 reasoning_content，
   * 少一条 DeepSeek 直接 400。所以这不是展示用的字段，而是协议要求。
   */
  const replayed = assistantMessages(calls[1]?.transcript ?? [])
  assert.deepEqual(
    replayed.map((message) => message.reasoning_content),
    ['这一轮的推理。'],
  )
})

test('previews each tool result for the timeline', async () => {
  const controller = new AbortController()
  const { requestModel } = scriptModel([
    {
      text: '',
      toolCalls: [
        { id: 'call_hits', name: 'search', arguments: '{"query":"a"}' },
        { id: 'call_empty', name: 'search', arguments: '{"query":"b"}' },
        { id: 'call_page', name: 'read_page', arguments: '{"url":"https://c.example"}' },
        { id: 'call_failed', name: 'read_page', arguments: '{"url":"https://d.example"}' },
      ],
    },
    { text: '答案。' },
  ])
  const { runTool } = scriptTools((toolCall) => {
    if (toolCall.id === 'call_hits') {
      return JSON.stringify({
        ok: true,
        results: [{ title: 'TypeScript 手册' }, { title: '入门' }],
      })
    }
    if (toolCall.id === 'call_empty') return JSON.stringify({ ok: true, results: [] })
    if (toolCall.id === 'call_page') {
      return JSON.stringify({ ok: true, result: { content: '正文开头', truncated: true } })
    }

    return JSON.stringify({ ok: false, error: 'provider_error', message: '502' })
  })

  const events = await collectEvents(
    askAgentStream(messages, { signal: controller.signal }, { requestModel, runTool }),
  )

  // 完整结果只进服务端账本，界面拿到的是这一行摘要；失败原因翻成人话，不摆英文错误码
  assert.deepEqual(
    pickEvents(events, 'tool_result').map((event) => event.preview),
    ['2 条 · TypeScript 手册 · 入门', '没有命中', '4 字符（截断） · 正文开头', '提供方请求失败'],
  )
})

test('sends a bounded source list along with a successful search', async () => {
  const controller = new AbortController()
  const { requestModel } = scriptModel([
    {
      text: '',
      toolCalls: [
        { id: 'call_search', name: 'search', arguments: '{"query":"a"}' },
        { id: 'call_page', name: 'read_page', arguments: '{"url":"https://c.example"}' },
      ],
    },
    { text: '答案。' },
  ])
  const { runTool } = scriptTools((toolCall) => {
    if (toolCall.id === 'call_page') {
      return JSON.stringify({ ok: true, result: { content: '正文' } })
    }

    return JSON.stringify({
      ok: true,
      results: [
        // 没有 url 的一条在界面上既点不开也无从追溯，直接丢掉而不是占一个名额
        { title: '没有地址', snippet: '略' },
        { url: 'https://a.example/1', title: ' 标\n题 ', snippet: 'x'.repeat(200) },
        ...Array.from({ length: 6 }, (_value, index) => ({
          url: `https://b.example/${index}`,
          title: `第 ${index} 条`,
          snippet: '',
        })),
      ],
    })
  })

  const events = await collectEvents(
    askAgentStream(messages, { signal: controller.signal }, { requestModel, runTool }),
  )
  const [search, page] = pickEvents(events, 'tool_result')

  // 上限 5 条：一屏能扫完，也不至于把整份搜索结果搬到客户端
  assert.equal(search?.sources?.length, 5)
  assert.deepEqual(search?.sources?.[0], {
    ref: 1,
    url: 'https://a.example/1',
    title: '标 题',
    // 摘要裁到 160 字符，最后一个字符换成省略号，读得出后面还有
    snippet: `${'x'.repeat(159)}…`,
  })
  assert.deepEqual(
    search?.sources?.slice(1).map((source) => source.url),
    ['https://b.example/0', 'https://b.example/1', 'https://b.example/2', 'https://b.example/3'],
  )
  // read_page 的正文是这里唯一的实证据，它继续只给一行摘要，不往客户端推
  assert.equal(page?.sources, undefined)
})

test('puts the parsed intent in front of the first round', async () => {
  const controller = new AbortController()
  const { requestModel, calls } = scriptModel([{ text: '答案。' }])
  const asked: string[] = []

  await collectEvents(
    askAgentStream(
      messages,
      { signal: controller.signal },
      {
        requestModel,
        extractIntent: async (input) => {
          asked.push(input)
          return intent
        },
      },
    ),
  )

  assert.deepEqual(asked, ['What is an agent?'])

  /*
   * 硬条件和排除项进了 system 消息，条件核对那一段才有一份现成的清单要逐条回答；
   * 起手查询由 buildSearchQueries 从同一份意图拼出来，第一次搜索就带上这些条件。
   */
  const system = String(calls[0]?.transcript[0]?.content)
  assert.match(system, /必须满足：包含完整示例/)
  assert.match(system, /必须排除：只讲框架用法/)
  assert.match(system, /起手查询.*Agent 教程/)
})

test('skips intent parsing for a follow-up question', async () => {
  const controller = new AbortController()
  const { requestModel, calls } = scriptModel([{ text: '答案。' }])
  const followUp: ChatMessage[] = [
    { role: 'user', content: '哪个框架是 Apache-2.0？' },
    { role: 'assistant', content: '是 A。' },
    { role: 'user', content: '那 B 呢？' },
  ]
  let asked = false

  await collectEvents(
    askAgentStream(
      followUp,
      { signal: controller.signal },
      {
        requestModel,
        extractIntent: async () => {
          asked = true
          return intent
        },
      },
    ),
  )

  // "那 B 呢"单独拿去解析只会得到一份跑偏的意图；这种时候历史消息本身就是上下文
  assert.equal(asked, false)
  assert.doesNotMatch(String(calls[0]?.transcript[0]?.content), /检索意图/)
})

test('keeps answering when intent parsing fails', async () => {
  const controller = new AbortController()
  const { requestModel, calls } = scriptModel([{ text: '答案。' }])

  const events = await collectEvents(
    askAgentStream(
      messages,
      { signal: controller.signal },
      { requestModel, extractIntent: () => Promise.reject(new Error('intent failed')) },
    ),
  )

  // 锦上添花的一步失败了不该让整次提问失败：循环没有它照样跑
  assert.deepEqual(events.at(-1), { type: 'done' })
  assert.doesNotMatch(String(calls[0]?.transcript[0]?.content), /检索意图/)
})

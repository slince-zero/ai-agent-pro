import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
} from 'openai/resources/index.mjs'
import {
  createRetrievalLedger,
  ledgerEvidence,
  normalizeUrl,
  projectContext,
  recordMessage,
  recordToolResult,
  setLedgerIntent,
} from './retrieval-ledger.js'
import type { RunStatus, ToolResultView } from './retrieval-ledger.js'
import { agentLimits } from '../util.js'

const status: RunStatus = { roundsLeft: 5, searchLeft: 9, pageLeft: 6 }

function toolCall(id: string, name: string, args = '{}'): ChatCompletionMessageFunctionToolCall {
  return { id, type: 'function', function: { name, arguments: args } }
}

function ledgerWith(history: ChatCompletionMessageParam[] = []) {
  return createRetrievalLedger('SYSTEM', history)
}

function record(
  ledger: ReturnType<typeof ledgerWith>,
  call: ChatCompletionMessageFunctionToolCall,
  content: unknown,
): ToolResultView {
  return recordToolResult(ledger, {
    toolCall: call,
    content: typeof content === 'string' ? content : JSON.stringify(content),
    status,
  })
}

/** 投影出来的 tool 消息，按顺序解析成对象 */
function toolContents(messages: ChatCompletionMessageParam[]) {
  return messages
    .filter((message) => message.role === 'tool')
    .map((message) => JSON.parse(String(message.content)) as Record<string, unknown>)
}

function page(content: string, url = 'https://a.example/doc') {
  return { ok: true, result: { url, content, truncated: false } }
}

test('projects the system prompt and the client history, and nothing else', () => {
  const history: ChatCompletionMessageParam[] = [{ role: 'user', content: '问题' }]

  assert.deepEqual(projectContext(ledgerWith(history)), [
    { role: 'system', content: 'SYSTEM' },
    { role: 'user', content: '问题' },
  ])
})

test('folds the retrieval intent into the system message', () => {
  const ledger = ledgerWith()
  setLedgerIntent(ledger, '意图：找教程')

  // 不另起一条 system 消息：意图就是这一次运行的行为约束的一部分
  assert.deepEqual(projectContext(ledger), [{ role: 'system', content: 'SYSTEM\n\n意图：找教程' }])
})

test('numbers each url once per run and reuses the number', () => {
  const ledger = ledgerWith()

  const first = record(ledger, toolCall('c1', 'search'), {
    ok: true,
    results: [
      { url: 'https://a.example/1', title: 'A', snippet: 'a' },
      { url: 'https://b.example/2', title: 'B', snippet: 'b' },
    ],
  })
  // 第二次搜索又搜到 b：编号不变，模型才看得出这是同一页
  const second = record(ledger, toolCall('c2', 'search'), {
    ok: true,
    results: [
      { url: 'https://b.example/2', title: 'B', snippet: 'b' },
      { url: 'https://c.example/3', title: 'C', snippet: 'c' },
    ],
  })

  assert.deepEqual(
    first.sources?.map((source) => source.ref),
    [1, 2],
  )
  assert.deepEqual(
    second.sources?.map((source) => source.ref),
    [2, 3],
  )
})

test('treats a fragment and a trailing slash as the same page', () => {
  const ledger = ledgerWith()

  record(ledger, toolCall('c1', 'search'), {
    ok: true,
    results: [{ url: 'https://a.example/doc/', title: 'A', snippet: 'a' }],
  })
  const again = record(ledger, toolCall('c2', 'search'), {
    ok: true,
    results: [{ url: 'https://a.example/doc#install', title: 'A', snippet: 'a' }],
  })

  assert.equal(again.sources?.[0]?.ref, 1)
  assert.equal(ledgerEvidence(ledger).length, 1)
  // 归一化只用来认地址，上线的还是来源第一次给出的那个能点开的链接
  assert.equal(again.sources?.[0]?.url, 'https://a.example/doc/')
})

test('keeps an unparsable url as its own key instead of throwing', () => {
  assert.equal(normalizeUrl('not a url'), 'not a url')
})

test('marks a source as read when read_page brings its body back', () => {
  const ledger = ledgerWith()

  record(ledger, toolCall('c1', 'search'), {
    ok: true,
    results: [
      { url: 'https://a.example/1', title: 'A', snippet: 'a' },
      { url: 'https://b.example/doc', title: 'B', snippet: 'b' },
    ],
  })
  record(
    ledger,
    toolCall('c2', 'read_page', '{"url":"https://b.example/doc"}'),
    page('正文', 'https://b.example/doc'),
  )

  // 读过正文的那一条沿用搜索时拿到的编号，答案里的 [2] 因此指得住
  assert.deepEqual(ledgerEvidence(ledger), [
    { ref: 1, url: 'https://a.example/1', title: 'A', snippet: 'a', read: false },
    { ref: 2, url: 'https://b.example/doc', title: 'B', snippet: 'b', read: true, chars: 2 },
  ])
})

test('numbers a page that never showed up in a search', () => {
  const ledger = ledgerWith()

  record(ledger, toolCall('c1', 'read_page', '{"url":"https://a.example/doc"}'), page('正文'))

  assert.deepEqual(ledgerEvidence(ledger), [
    { ref: 1, url: 'https://a.example/doc', title: '', snippet: '', read: true, chars: 2 },
  ])
})

test('falls back to the requested url when the provider omits it', () => {
  const ledger = ledgerWith()

  record(ledger, toolCall('c1', 'read_page', '{"url":"https://a.example/doc"}'), {
    ok: true,
    result: { content: '正文', truncated: false },
  })

  assert.equal(ledgerEvidence(ledger)[0]?.url, 'https://a.example/doc')
})

test('sends the model the reference numbers and the remaining budget', () => {
  const ledger = ledgerWith()

  record(ledger, toolCall('c1', 'search'), {
    ok: true,
    results: [{ url: 'https://a.example/1', title: 'A', snippet: 'a' }],
  })

  assert.deepEqual(toolContents(projectContext(ledger)), [
    {
      ok: true,
      count: 1,
      sources: [{ ref: 1, url: 'https://a.example/1', title: 'A', snippet: 'a' }],
      budget: { search: 9, read_page: 6 },
      rounds_left: 5,
    },
  ])
})

test('keeps the tool_call_id of every recorded result', () => {
  const ledger = ledgerWith()

  record(ledger, toolCall('c1', 'search'), { ok: true, results: [] })
  recordMessage(ledger, { role: 'assistant', content: '读一下' })
  record(ledger, toolCall('c2', 'read_page', '{"url":"https://a.example/doc"}'), page('正文'))

  assert.deepEqual(
    projectContext(ledger).map((message) => message.role),
    ['system', 'tool', 'assistant', 'tool'],
  )
  assert.deepEqual(
    projectContext(ledger)
      .filter((message) => message.role === 'tool')
      .map((message) => message.tool_call_id),
    ['c1', 'c2'],
  )
})

test('gives full bodies to the pages read most recently', () => {
  const ledger = ledgerWith()
  const half = agentLimits.maxPageContextLength / 2

  for (const [index, letter] of ['a', 'b', 'c'].entries()) {
    record(
      ledger,
      toolCall(`c${index}`, 'read_page'),
      page(letter.repeat(half), `https://${letter}.example/doc`),
    )
  }

  const contents = toolContents(projectContext(ledger))

  // 最早读的那一页被挤成摘录：它该记住的结论模型已经写进正文了
  assert.deepEqual(
    contents.map((content) => typeof content.content === 'string'),
    [false, true, true],
  )
  assert.equal(contents[0]?.excerpt, 'a'.repeat(agentLimits.pageExcerptLength))
  // 编号、地址和字数留着：模型仍然引用得了这一页，也知道自己读过它
  assert.deepEqual(
    contents.map((content) => [content.ref, content.url, content.chars]),
    [
      [1, 'https://a.example/doc', half],
      [2, 'https://b.example/doc', half],
      [3, 'https://c.example/doc', half],
    ],
  )
  assert.match(String(contents[0]?.note), /Do not read this url again/)
})

test('keeps a small page that fits behind a page that does not', () => {
  const ledger = ledgerWith()

  record(ledger, toolCall('c1', 'read_page'), page('a'.repeat(100), 'https://a.example/doc'))
  record(
    ledger,
    toolCall('c2', 'read_page'),
    page('b'.repeat(agentLimits.maxPageContextLength - 50), 'https://b.example/doc'),
  )
  record(ledger, toolCall('c3', 'read_page'), page('c'.repeat(100), 'https://c.example/doc'))

  // 放不下的那一页跳过去继续往前看，不是就此收手——后面还有塞得进去的
  assert.deepEqual(
    toolContents(projectContext(ledger)).map((content) => typeof content.content === 'string'),
    [true, false, true],
  )
})

test('projects the same ledger the same way every time', () => {
  const ledger = ledgerWith([{ role: 'user', content: '问题' }])

  record(ledger, toolCall('c1', 'search'), {
    ok: true,
    results: [{ url: 'https://a.example/1', title: 'A', snippet: 'a' }],
  })
  record(ledger, toolCall('c2', 'read_page'), page('正文'))

  // 纯投影：预算生效之后模型看到了什么，是可以直接断言的
  assert.deepEqual(projectContext(ledger), projectContext(ledger))
})

test('keeps what a failed tool said, and translates it for the timeline', () => {
  const ledger = ledgerWith()

  const view = record(ledger, toolCall('c1', 'search'), {
    ok: false,
    error: 'invalid_tool_arguments',
    issues: [{ path: 'query', message: 'Required' }],
  })

  assert.deepEqual(view, { ok: false, preview: '参数不合法' })
  // issues 是模型改对参数的唯一线索，原样留在上下文里
  assert.deepEqual(toolContents(projectContext(ledger)), [
    {
      ok: false,
      error: 'invalid_tool_arguments',
      issues: [{ path: 'query', message: 'Required' }],
      budget: { search: 9, read_page: 6 },
      rounds_left: 5,
    },
  ])
})

test('passes an unknown error code through instead of swallowing it', () => {
  const ledger = ledgerWith()

  assert.deepEqual(record(ledger, toolCall('c1', 'search'), { ok: false, error: 'teapot' }), {
    ok: false,
    preview: 'teapot',
  })
})

test('keeps a non-JSON tool result verbatim', () => {
  const ledger = ledgerWith()

  assert.deepEqual(record(ledger, toolCall('c1', 'search'), 'not json'), { ok: false })
  assert.equal(
    projectContext(ledger).find((message) => message.role === 'tool')?.content,
    'not json',
  )
})

test('hands out copies of the source records', () => {
  const ledger = ledgerWith()

  record(ledger, toolCall('c1', 'search'), {
    ok: true,
    results: [{ url: 'https://a.example/1', title: 'A', snippet: 'a' }],
  })

  const snapshot = ledgerEvidence(ledger)
  record(ledger, toolCall('c2', 'read_page'), page('正文', 'https://a.example/1'))

  // 事件已经发出去之后账本还在改，快照不该跟着变
  assert.equal(snapshot[0]?.read, false)
  assert.equal(ledgerEvidence(ledger)[0]?.read, true)
})

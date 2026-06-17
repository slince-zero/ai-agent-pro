import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'

import type OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

type StreamChunk = {
  choices: {
    delta?: {
      content?: string
      tool_calls?: {
        index: number
        id?: string
        function?: {
          name?: string
          arguments?: string
        }
      }[]
    }
    finish_reason?: string | null
  }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
  }
}

function streamFrom(chunks: StreamChunk[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

function createFakeOpenAI(streams: ReturnType<typeof streamFrom>[]) {
  const requests: {
    messages?: ChatCompletionMessageParam[]
    tools?: unknown
    stream_options?: unknown
  }[] = []

  const openai = {
    chat: {
      completions: {
        create: async (request: (typeof requests)[number]) => {
          requests.push(request)
          const stream = streams.shift()
          if (!stream) throw new Error('No fake stream configured')
          return stream
        },
      },
    },
  } as unknown as OpenAI

  return { openai, requests }
}

afterEach(() => {
  mock.restoreAll()
})

test('streams text deltas and returns accumulated usage', async () => {
  const { runAgent } = await import('./agent.js')
  const { openai, requests } = createFakeOpenAI([
    streamFrom([
      { choices: [{ delta: { content: '<p>Hello' } }] },
      {
        choices: [{ delta: { content: ' world</p>' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 11, completion_tokens: 5 },
      },
    ]),
  ])
  const events: unknown[] = []

  const usage = await runAgent({
    openai,
    messages: [{ role: 'user', content: 'Say hello' }],
    signal: new AbortController().signal,
    onEvent: (event) => {
      events.push(event)
    },
  })

  assert.deepEqual(usage, { inputTokens: 11, outputTokens: 5 })
  assert.deepEqual(events, [
    { type: 'text', text: '<p>Hello' },
    { type: 'text', text: ' world</p>' },
  ])
  assert.equal(requests.length, 1)
  assert.deepEqual(requests[0]?.stream_options, { include_usage: true })
  assert.ok(requests[0]?.tools)
})

test('assembles streamed tool call arguments, runs the tool, and continues the model loop', async () => {
  mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response('<html><head><title>Example</title></head><body>Tool body</body></html>', {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
      }),
  )

  const { runAgent } = await import('./agent.js')
  const { openai, requests } = createFakeOpenAI([
    streamFrom([
      { choices: [{ delta: { content: '<p>Checking.</p>' } }] },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  function: {
                    name: 'web_fetch',
                    arguments: '{"url":"http://93.184.216.34',
                  },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: {
                    arguments: '/docs"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 8 },
      },
    ]),
    streamFrom([
      {
        choices: [{ delta: { content: '<p>Done.</p>' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 13, completion_tokens: 4 },
      },
    ]),
  ])
  const events: unknown[] = []

  const usage = await runAgent({
    openai,
    messages: [{ role: 'user', content: 'Fetch the docs' }],
    signal: new AbortController().signal,
    onEvent: (event) => {
      events.push(event)
    },
  })

  assert.deepEqual(usage, { inputTokens: 33, outputTokens: 12 })
  assert.deepEqual(
    events.map((event) => (event as { type: string }).type),
    ['text', 'tool_call', 'tool_result', 'text'],
  )
  assert.deepEqual(events[1], {
    type: 'tool_call',
    toolCallId: 'call_1',
    name: 'web_fetch',
    args: { url: 'http://93.184.216.34/docs' },
  })
  assert.match((events[2] as { result: string }).result, /Tool body/)
  assert.equal(requests.length, 2)

  const secondMessages = requests[1]?.messages ?? []
  assert.equal(
    secondMessages.some((message) => message.role === 'tool'),
    true,
  )
  assert.equal(
    secondMessages.some(
      (message) =>
        message.role === 'assistant' &&
        Array.isArray((message as { tool_calls?: unknown[] }).tool_calls),
    ),
    true,
  )
})

test('returns a tool_result event for malformed streamed tool arguments', async () => {
  const { runAgent } = await import('./agent.js')
  const { openai } = createFakeOpenAI([
    streamFrom([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_bad_args',
                  function: {
                    name: 'web_fetch',
                    arguments: '{"url":',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      },
    ]),
    streamFrom([{ choices: [{ delta: { content: '<p>Recovered.</p>' }, finish_reason: 'stop' }] }]),
  ])
  const events: unknown[] = []

  await runAgent({
    openai,
    messages: [{ role: 'user', content: 'Fetch malformed args' }],
    signal: new AbortController().signal,
    onEvent: (event) => {
      events.push(event)
    },
  })

  const toolResult = events.find(
    (event): event is { type: string; result: string; toolCallId: string } =>
      (event as { type?: string }).type === 'tool_result',
  )

  assert.equal(toolResult?.toolCallId, 'call_bad_args')
  assert.match(toolResult?.result ?? '', /工具参数解析失败/)
})

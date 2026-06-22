import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'

import type { ModelClient, ModelMessage, ModelStreamChunk } from '../runtime/model-client/types.js'
import type { ToolDefinition } from '../tools/types.js'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

function streamFrom(chunks: ModelStreamChunk[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

function createFakeModelClient(streams: ReturnType<typeof streamFrom>[]) {
  const requests: {
    messages: ModelMessage[]
    tools: ToolDefinition[]
    signal: AbortSignal
  }[] = []

  const modelClient: ModelClient = {
    streamChat: async (request) => {
      requests.push(request)
      const stream = streams.shift()
      if (!stream) throw new Error('No fake stream configured')
      return stream
    },
  }

  return { modelClient, requests }
}

afterEach(() => {
  mock.restoreAll()
})

test('streams text deltas and returns accumulated usage', async () => {
  const { runAgent } = await import('./agent.js')
  const { modelClient, requests } = createFakeModelClient([
    streamFrom([
      { choices: [{ delta: { content: '<p>Hello' } }] },
      {
        choices: [{ delta: { content: ' world</p>' }, finishReason: 'stop' }],
        usage: { inputTokens: 11, outputTokens: 5 },
      },
    ]),
  ])
  const events: unknown[] = []

  const usage = await runAgent({
    modelClient,
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
  assert.ok(requests[0]?.tools.length)
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
  const { modelClient, requests } = createFakeModelClient([
    streamFrom([
      { choices: [{ delta: { content: '<p>Checking.</p>' } }] },
      {
        choices: [
          {
            delta: {
              toolCalls: [
                {
                  index: 0,
                  id: 'call_1',
                  name: 'web_fetch',
                  argumentsDelta: '{"url":"http://93.184.216.34',
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
              toolCalls: [
                {
                  index: 0,
                  argumentsDelta: '/docs"}',
                },
              ],
            },
            finishReason: 'tool_calls',
          },
        ],
        usage: { inputTokens: 20, outputTokens: 8 },
      },
    ]),
    streamFrom([
      {
        choices: [{ delta: { content: '<p>Done.</p>' }, finishReason: 'stop' }],
        usage: { inputTokens: 13, outputTokens: 4 },
      },
    ]),
  ])
  const events: unknown[] = []

  const usage = await runAgent({
    modelClient,
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
        Array.isArray((message as { toolCalls?: unknown[] }).toolCalls),
    ),
    true,
  )
})

test('returns a tool_result event for malformed streamed tool arguments', async () => {
  const { runAgent } = await import('./agent.js')
  const { modelClient } = createFakeModelClient([
    streamFrom([
      {
        choices: [
          {
            delta: {
              toolCalls: [
                {
                  index: 0,
                  id: 'call_bad_args',
                  name: 'web_fetch',
                  argumentsDelta: '{"url":',
                },
              ],
            },
            finishReason: 'tool_calls',
          },
        ],
      },
    ]),
    streamFrom([{ choices: [{ delta: { content: '<p>Recovered.</p>' }, finishReason: 'stop' }] }]),
  ])
  const events: unknown[] = []

  await runAgent({
    modelClient,
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

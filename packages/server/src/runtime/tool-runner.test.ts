import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

const { orderToolCalls, runToolCalls, toAssistantToolCalls } = await import('./tool-runner.js')

test('orders tool calls and formats assistant tool call messages', () => {
  const ordered = orderToolCalls(
    new Map([
      [2, { id: 'call_c', name: 'tool_c', arguments: '{"c":true}' }],
      [0, { id: 'call_a', name: 'tool_a', arguments: '{"a":true}' }],
      [1, { id: 'call_b', name: 'tool_b', arguments: '' }],
    ]),
  )

  assert.deepEqual(
    ordered.map((call) => call.id),
    ['call_a', 'call_b', 'call_c'],
  )
  assert.deepEqual(toAssistantToolCalls(ordered), [
    {
      id: 'call_a',
      type: 'function',
      function: { name: 'tool_a', arguments: '{"a":true}' },
    },
    {
      id: 'call_b',
      type: 'function',
      function: { name: 'tool_b', arguments: '{}' },
    },
    {
      id: 'call_c',
      type: 'function',
      function: { name: 'tool_c', arguments: '{"c":true}' },
    },
  ])
})

test('runs parsed tools in model order and appends tool messages', async () => {
  const conversation: ChatCompletionMessageParam[] = [{ role: 'system', content: 'System' }]
  const events: unknown[] = []
  const executed: unknown[] = []

  const result = await runToolCalls({
    conversation,
    assistantText: '<p>Checking.</p>',
    toolCalls: new Map([
      [1, { id: 'call_b', name: 'tool_b', arguments: '{"value":"b"}' }],
      [0, { id: 'call_a', name: 'tool_a', arguments: '{"value":"a"}' }],
    ]),
    signal: new AbortController().signal,
    executeTool: async (name, args) => {
      executed.push({ name, args })
      return `result for ${name}`
    },
    onEvent: (event) => {
      events.push(event)
    },
  })

  assert.deepEqual(result, { aborted: false })
  assert.deepEqual(executed, [
    { name: 'tool_a', args: { value: 'a' } },
    { name: 'tool_b', args: { value: 'b' } },
  ])
  assert.deepEqual(
    events.map((event) => (event as { type: string }).type),
    ['tool_call', 'tool_result', 'tool_call', 'tool_result'],
  )
  assert.equal(conversation[1]?.role, 'assistant')
  assert.equal(conversation[2]?.role, 'tool')
  assert.equal(conversation[3]?.role, 'tool')
})

test('emits a tool_result without executing tools when arguments are malformed', async () => {
  const conversation: ChatCompletionMessageParam[] = [{ role: 'system', content: 'System' }]
  const events: unknown[] = []

  await runToolCalls({
    conversation,
    assistantText: '',
    toolCalls: new Map([[0, { id: 'call_bad', name: 'web_fetch', arguments: '{"url":' }]]),
    signal: new AbortController().signal,
    executeTool: async () => {
      throw new Error('executeTool should not be called')
    },
    onEvent: (event) => {
      events.push(event)
    },
  })

  assert.equal(events.length, 1)
  assert.equal((events[0] as { type: string }).type, 'tool_result')
  assert.match((events[0] as { result: string }).result, /工具参数解析失败/)
  assert.equal(conversation[1]?.role, 'assistant')
  assert.equal(conversation[2]?.role, 'tool')
})

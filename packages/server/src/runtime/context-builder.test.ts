import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

const {
  buildAgentConversation,
  buildContextMessages,
  createContextBuilder,
  formatSummaryForContext,
  selectContextMessages,
} = await import('./context-builder.js')

test('builds system-prefixed OpenAI chat messages from client history', () => {
  const conversation = buildAgentConversation(
    [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ],
    'System prompt',
  )

  assert.deepEqual(conversation, [
    { role: 'system', content: 'System prompt' },
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there' },
  ])
})

test('selects a deterministic recent message window', () => {
  const selected = selectContextMessages(
    [
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'two' },
      { role: 'user', content: 'three' },
      { role: 'assistant', content: 'four' },
    ],
    { maxMessages: 2, maxChars: 100 },
  )

  assert.deepEqual(selected, [
    { role: 'user', content: 'three' },
    { role: 'assistant', content: 'four' },
  ])
})

test('keeps the newest contiguous messages within the character budget', () => {
  const selected = selectContextMessages(
    [
      { role: 'user', content: 'old' },
      { role: 'assistant', content: 'bbbb' },
      { role: 'user', content: 'cccc' },
    ],
    { maxMessages: 3, maxChars: 8 },
  )

  assert.deepEqual(selected, [
    { role: 'assistant', content: 'bbbb' },
    { role: 'user', content: 'cccc' },
  ])
})

test('truncates the newest oversized message when it alone exceeds budget', () => {
  const selected = selectContextMessages([{ role: 'user', content: 'abcdefghij' }], {
    maxMessages: 5,
    maxChars: 6,
  })

  assert.deepEqual(selected, [{ role: 'user', content: '...hij' }])
})

test('supports reserved context injection slots before recent history', () => {
  const selected = buildContextMessages([{ role: 'user', content: 'recent question' }], {
    maxMessages: 5,
    maxChars: 100,
    injections: [
      {
        source: 'summary',
        messages: [{ role: 'assistant', content: 'session summary' }],
      },
      {
        source: 'memory',
        messages: [{ role: 'assistant', content: 'relevant memory' }],
      },
    ],
  })

  assert.deepEqual(selected, [
    { role: 'assistant', content: 'session summary' },
    { role: 'assistant', content: 'relevant memory' },
    { role: 'user', content: 'recent question' },
  ])
})

test('formats session summaries as assistant context messages', () => {
  assert.deepEqual(formatSummaryForContext('Earlier work and decisions.'), {
    role: 'assistant',
    content: 'Session summary:\nEarlier work and decisions.',
  })
})

test('loads recent history through the context builder source', async () => {
  const calls: { sessionId: string; take: number }[] = []
  const builder = createContextBuilder({
    source: {
      loadRecentMessages: async (sessionId, take) => {
        calls.push({ sessionId, take })
        return [
          { role: 'user', content: 'older' },
          { role: 'assistant', content: 'kept' },
          { role: 'user', content: 'newest' },
        ]
      },
    },
    options: {
      maxMessages: 2,
      maxChars: 100,
      systemPrompt: 'System prompt',
    },
  })

  const messages = await builder.buildClientMessages('session_1')
  const conversation = await builder.buildConversation('session_1')

  assert.deepEqual(calls, [
    { sessionId: 'session_1', take: 2 },
    { sessionId: 'session_1', take: 2 },
  ])
  assert.deepEqual(messages, [
    { role: 'assistant', content: 'kept' },
    { role: 'user', content: 'newest' },
  ])
  assert.deepEqual(conversation, [
    { role: 'system', content: 'System prompt' },
    { role: 'assistant', content: 'kept' },
    { role: 'user', content: 'newest' },
  ])
})

test('injects a loaded session summary before recent history', async () => {
  const builder = createContextBuilder({
    source: {
      loadSessionSummary: async () => 'Earlier goals and constraints.',
      loadRecentMessages: async () => [{ role: 'user', content: 'Continue' }],
    },
    options: {
      maxMessages: 5,
      maxChars: 100,
    },
  })

  const messages = await builder.buildClientMessages('session_1')

  assert.deepEqual(messages, [
    { role: 'assistant', content: 'Session summary:\nEarlier goals and constraints.' },
    { role: 'user', content: 'Continue' },
  ])
})

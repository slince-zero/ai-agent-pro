import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

const { buildAgentConversation } = await import('./context-builder.js')

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

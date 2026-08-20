import assert from 'node:assert/strict'
import { test } from 'node:test'
import { askAgent } from '../src/agent.js'

const messages = [{ role: 'user' as const, content: 'What is an agent?' }]
const usage = { inputTokens: 10, outputTokens: 12, totalTokens: 22 }

test('returns the model answer', async () => {
  const expected = {
    message: 'An agent can use a model and tools to complete a task.',
    usage,
  }

  const result = await askAgent(messages, async (receivedMessages) => {
    assert.deepEqual(receivedMessages, messages)
    return expected
  })

  assert.deepEqual(result, expected)
})

test('rejects an empty model answer', async () => {
  await assert.rejects(
    askAgent(messages, async () => ({ message: '   ', usage })),
    /Model returned an empty answer/,
  )
})

test('passes model request failures to the caller', async () => {
  await assert.rejects(
    askAgent(messages, async () => {
      throw new Error('network failed')
    }),
    /network failed/,
  )
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AgentStreamEvent, ChatMessage, TokenUsage } from '@ai-agent-pro/shared/type.js'
import { askAgentStream } from '../src/agent.js'

const messages: ChatMessage[] = [{ role: 'user', content: 'What is an agent?' }]
const usage: TokenUsage = { inputTokens: 10, outputTokens: 12, totalTokens: 22 }

async function collectEvents(events: AsyncIterable<AgentStreamEvent>) {
  const result: AgentStreamEvent[] = []

  for await (const event of events) {
    result.push(event)
  }

  return result
}

async function* failingRequestModel(): AsyncGenerator<never> {
  yield* []
  throw new Error('network failed')
}

test('streams model events and appends done', async () => {
  async function* requestModel(receivedMessages: ChatMessage[]) {
    assert.deepEqual(receivedMessages, messages)
    yield { type: 'text_delta', delta: 'An agent can ' } as const
    yield { type: 'text_delta', delta: 'use tools.' } as const
    yield { type: 'usage', usage } as const
  }

  const result = await collectEvents(askAgentStream(messages, requestModel))

  assert.deepEqual(result, [
    { type: 'text_delta', delta: 'An agent can ' },
    { type: 'text_delta', delta: 'use tools.' },
    { type: 'usage', usage },
    { type: 'done' },
  ])
})

test('rejects an empty model answer', async () => {
  async function* requestModel() {
    yield { type: 'text_delta', delta: '   ' } as const
    yield { type: 'usage', usage } as const
  }

  await assert.rejects(
    collectEvents(askAgentStream(messages, requestModel)),
    /Model returned an empty answer/,
  )
})

test('passes model request failures to the caller', async () => {
  await assert.rejects(
    collectEvents(askAgentStream(messages, failingRequestModel)),
    /network failed/,
  )
})

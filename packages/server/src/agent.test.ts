import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ChatCompletionMessageParam } from 'openai/resources/index.mjs'
import type { AgentStreamEvent, ChatMessage, TokenUsage } from '@ai-agent-pro/shared/type.js'
import { askAgentStream } from './agent.js'
import type { AgentRunContext, ModelStreamChunk } from './agent.js'

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

async function* turnlessRequestModel(): AsyncGenerator<ModelStreamChunk> {
  yield { type: 'text_delta', delta: 'partial answer' }
}

test('streams model events and appends done', async () => {
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
      turn: { text: 'An agent can use tools.', toolCalls: [] },
    }
  }

  const result = await collectEvents(
    askAgentStream(messages, { signal: controller.signal }, { requestModel }),
  )

  // turn_end 是循环的内部分片，不应该出现在客户端事件流里。
  assert.deepEqual(result, [
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
    yield { type: 'turn_end', turn: { text: '   ', toolCalls: [] } }
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
    value: { type: 'text_delta', delta: 'partial answer' },
    done: false,
  })

  controller.abort()

  await assert.rejects(stream.next(), /aborted/)
})

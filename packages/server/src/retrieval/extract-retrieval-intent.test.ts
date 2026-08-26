import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ZodError } from 'zod'
import type { ChatMessage } from '@ai-agent-pro/shared/type.js'
import { extractRetrievalIntent } from './extract-retrieval-intent.js'

const input = '找适合初学者并有完整示例的 Agent 教程，最好是 TypeScript，排除只介绍框架用法的内容'

const modelOutput = {
  target: 'Agent context engineering 教程',
  contentType: '教程',
  hardConstraints: ['适合初学者', '包含完整示例'],
  exclusions: ['只介绍框架用法'],
  preferences: ['使用 TypeScript'],
  ambiguities: [],
  language: '中文',
  timeRange: null,
}

test('extracts and validates a retrieval intent', async () => {
  const controller = new AbortController()

  async function requestModel(messages: ChatMessage[], signal: AbortSignal) {
    assert.equal(signal, controller.signal)
    assert.equal(messages.length, 2)
    assert.equal(messages[0]?.role, 'system')
    assert.match(messages[0]?.content ?? '', /JSON/i)
    assert.deepEqual(messages[1], {
      role: 'user',
      content: input,
    })

    return JSON.stringify(modelOutput)
  }

  const intent = await extractRetrievalIntent(input, controller.signal, requestModel)

  assert.deepEqual(intent, modelOutput)
  assert.deepEqual(intent.preferences, ['使用 TypeScript'])
  assert.equal(intent.hardConstraints.includes('使用 TypeScript'), false)
})

test('rejects an empty model response', async () => {
  await assert.rejects(
    extractRetrievalIntent(input, new AbortController().signal, async () => '   '),
    /Model returned an empty retrieval intent/,
  )
})

test('rejects malformed JSON from the model', async () => {
  await assert.rejects(
    extractRetrievalIntent(input, new AbortController().signal, async () => '{'),
    SyntaxError,
  )
})

test('rejects JSON that does not match the retrieval intent schema', async () => {
  await assert.rejects(
    extractRetrievalIntent(input, new AbortController().signal, async () =>
      JSON.stringify({ target: 'Agent 教程' }),
    ),
    ZodError,
  )
})

test('passes model request failures to the caller', async () => {
  await assert.rejects(
    extractRetrievalIntent(input, new AbortController().signal, async () => {
      throw new Error('network failed')
    }),
    /network failed/,
  )
})

test('forwards an aborted signal to the model request', async () => {
  const controller = new AbortController()
  controller.abort()

  async function requestModel(_messages: ChatMessage[], signal: AbortSignal) {
    signal.throwIfAborted()
    return JSON.stringify(modelOutput)
  }

  await assert.rejects(extractRetrievalIntent(input, controller.signal, requestModel), {
    name: 'AbortError',
  })
})

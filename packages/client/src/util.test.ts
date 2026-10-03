import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { MessageStreamEvent, RetrievalTask } from '@ai-agent-pro/shared/type.js'
import { consumeNDJSON } from './util'

const task: RetrievalTask = {
  mode: 'retrieve',
  intent: {
    target: 'Express 5 入门资料',
    contentType: '教程',
    hardConstraints: ['中文'],
    exclusions: ['Express 4'],
    preferences: [],
    ambiguities: [],
    language: '中文',
    timeRange: null,
  },
}

test('accepts streamed task conditions split across byte chunks', async () => {
  const bytes = new TextEncoder().encode(
    `${JSON.stringify({ type: 'retrieval_task', task })}\n${JSON.stringify({ type: 'done' })}\n`,
  )
  const response = new Response(
    new ReadableStream({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 7)
          controller.enqueue(bytes.slice(offset, offset + 7))
        controller.close()
      },
    }),
  )
  const events: MessageStreamEvent[] = []
  await consumeNDJSON(response, (event) => events.push(event))
  assert.deepEqual(events, [{ type: 'retrieval_task', task }, { type: 'done' }])
})
test('rejects malformed task state instead of presenting misleading conditions', async () => {
  await assert.rejects(
    consumeNDJSON(
      new Response(
        `${JSON.stringify({ type: 'retrieval_task', task: { mode: 'retrieve', intent: { target: 'Express' } } })}\n`,
      ),
      () => assert.fail('不应传给界面'),
    ),
    /invalid stream event/,
  )
})
test('accepts clarification and ordinary chat routing', async () => {
  const events: MessageStreamEvent[] = []
  const clarify: RetrievalTask = {
    mode: 'clarify',
    intent: { ...task.intent, ambiguities: ['短一点'] },
    question: '希望几分钟读完？',
  }
  await consumeNDJSON(
    new Response(
      `${JSON.stringify({ type: 'retrieval_task', task: clarify })}\n${JSON.stringify({ type: 'retrieval_task', task: { mode: 'chat' } })}`,
    ),
    (event) => events.push(event),
  )
  assert.deepEqual(events, [
    { type: 'retrieval_task', task: clarify },
    { type: 'retrieval_task', task: { mode: 'chat' } },
  ])
})

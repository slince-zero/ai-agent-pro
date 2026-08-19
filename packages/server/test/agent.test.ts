import assert from 'node:assert/strict'
import { test } from 'node:test'
import { askAgent } from '../src/agent.js'

test('returns the model answer', async () => {
  const answer = await askAgent('What is an agent?', async (question) => {
    assert.equal(question, 'What is an agent?')
    return 'An agent can use a model and tools to complete a task.'
  })

  assert.equal(answer, 'An agent can use a model and tools to complete a task.')
})

test('rejects an empty model answer', async () => {
  await assert.rejects(
    askAgent('Say something', async () => '   '),
    /Model returned an empty answer/,
  )
})

test('passes model request failures to the caller', async () => {
  await assert.rejects(
    askAgent('Say something', async () => {
      throw new Error('network failed')
    }),
    /network failed/,
  )
})

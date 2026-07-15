import assert from 'node:assert/strict'
import { test } from 'node:test'

import { z } from 'zod'

import { definePlugin, defineTool } from './index.js'

const echoTool = defineTool({
  name: 'echo',
  description: 'Echoes text.',
  governance: {
    category: 'system',
    sideEffect: false,
    requiresAuth: false,
    timeoutMs: 1_000,
  },
  schema: z.object({
    text: z.string().describe('Text to echo.'),
  }),
  run: ({ text }, { signal }) => {
    assert.equal(signal.aborted, false)
    return text
  },
})

test('defineTool derives model parameters from a Zod schema', async () => {
  assert.equal(echoTool.parameters.type, 'object')
  assert.deepEqual(echoTool.parameters.required, ['text'])
  assert.deepEqual(echoTool.parameters.properties.text, {
    type: 'string',
    description: 'Text to echo.',
  })

  const result = await echoTool.run({ text: 'hello' }, { signal: new AbortController().signal })
  assert.equal(result, 'hello')
})

test('defineTool preserves an explicit object JSON Schema', () => {
  const parameters = {
    type: 'object' as const,
    properties: {},
    additionalProperties: true,
  }
  const tool = defineTool({
    ...echoTool,
    name: 'dynamic_echo',
    parameters,
  })

  assert.equal(tool.parameters, parameters)
})

test('defineTool rejects model-incompatible names', () => {
  assert.throws(
    () =>
      defineTool({
        ...echoTool,
        name: 'not a valid tool name',
      }),
    /Invalid tool name/,
  )
})

test('definePlugin validates duplicate tools', () => {
  assert.throws(
    () =>
      definePlugin({
        name: 'example',
        version: '1.0.0',
        tools: [echoTool, echoTool],
      }),
    /duplicate tool/,
  )
})

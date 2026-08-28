import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ChatCompletionMessageFunctionToolCall } from 'openai/resources/index.mjs'
import { executeTool } from './execute-tool.js'

function createToolCall(
  name: string,
  argumentsJson: string,
): ChatCompletionMessageFunctionToolCall {
  return {
    id: 'call-1',
    type: 'function',
    function: {
      name,
      arguments: argumentsJson,
    },
  }
}

test('returns a structured error for an unknown tool', async () => {
  const result = await executeTool(createToolCall('unknown', '{}'), new AbortController().signal)

  assert.deepEqual(JSON.parse(result), {
    ok: false,
    error: 'unknown_tool',
    message: 'Unknown tool: unknown',
  })
})

test('returns a structured error for malformed JSON arguments', async () => {
  const result = await executeTool(createToolCall('search', '{'), new AbortController().signal)
  const parsedResult = JSON.parse(result)

  assert.equal(parsedResult.ok, false)
  assert.equal(parsedResult.error, 'invalid_tool_arguments')
  assert.equal(parsedResult.issues.length > 0, true)
})

test('returns schema issues for invalid search arguments', async () => {
  const result = await executeTool(
    createToolCall('search', JSON.stringify({ query: '', limit: 10 })),
    new AbortController().signal,
  )
  const parsedResult = JSON.parse(result)

  assert.equal(parsedResult.ok, false)
  assert.equal(parsedResult.error, 'invalid_tool_arguments')
  assert.equal(parsedResult.issues.length > 0, true)
})

test('does not hide a missing Tavily API key', async () => {
  const originalApiKey = process.env.TAVILY_API_KEY
  delete process.env.TAVILY_API_KEY

  try {
    await assert.rejects(
      executeTool(
        createToolCall('search', JSON.stringify({ query: 'Agent 教程' })),
        new AbortController().signal,
      ),
      /TAVILY_API_KEY is not configured/,
    )
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.TAVILY_API_KEY
    } else {
      process.env.TAVILY_API_KEY = originalApiKey
    }
  }
})

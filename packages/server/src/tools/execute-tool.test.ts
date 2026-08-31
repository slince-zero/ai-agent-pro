import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ChatCompletionMessageFunctionToolCall } from 'openai/resources/index.mjs'
import { executeTool } from './execute-tool.js'
import { ToolProviderHttpError } from './tool-errors.js'

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

test('executes a search tool call', async () => {
  const result = await executeTool(
    createToolCall('search', JSON.stringify({ query: 'Agent 教程' })),
    new AbortController().signal,
    {
      search: async () => [
        {
          title: 'Agent guide',
          url: 'https://example.com/agent',
          snippet: 'A guide.',
        },
      ],
    },
  )

  assert.deepEqual(JSON.parse(result), {
    ok: true,
    results: [
      {
        title: 'Agent guide',
        url: 'https://example.com/agent',
        snippet: 'A guide.',
      },
    ],
  })
})

test('executes a read page tool call', async () => {
  const result = await executeTool(
    createToolCall('read_page', JSON.stringify({ url: 'https://example.com/agent' })),
    new AbortController().signal,
    {
      readPage: async () => ({
        url: 'https://example.com/agent',
        content: '# Agent guide',
        truncated: false,
      }),
    },
  )

  assert.deepEqual(JSON.parse(result), {
    ok: true,
    result: {
      url: 'https://example.com/agent',
      content: '# Agent guide',
      truncated: false,
    },
  })
})

test('returns a structured error for invalid read page arguments', async () => {
  const result = await executeTool(
    createToolCall('read_page', JSON.stringify({ url: 'not-a-url' })),
    new AbortController().signal,
  )
  const parsedResult = JSON.parse(result)

  assert.equal(parsedResult.ok, false)
  assert.equal(parsedResult.error, 'invalid_tool_arguments')
})

test('returns a non-retryable error for a missing Tavily API key', async () => {
  const originalApiKey = process.env.TAVILY_API_KEY
  delete process.env.TAVILY_API_KEY

  try {
    const result = await executeTool(
      createToolCall('search', JSON.stringify({ query: 'Agent 教程' })),
      new AbortController().signal,
    )

    assert.deepEqual(JSON.parse(result), {
      ok: false,
      error: 'tool_unavailable',
      message: 'TAVILY_API_KEY is not configured',
      retryable: false,
    })
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.TAVILY_API_KEY
    } else {
      process.env.TAVILY_API_KEY = originalApiKey
    }
  }
})

test('returns a retryable error when the provider rate limits a tool call', async () => {
  const result = await executeTool(
    createToolCall('search', JSON.stringify({ query: 'Agent 教程' })),
    new AbortController().signal,
    {
      search: async () => {
        throw new ToolProviderHttpError('Tavily search failed', 429)
      },
    },
  )

  assert.deepEqual(JSON.parse(result), {
    ok: false,
    error: 'rate_limited',
    message: 'Tool provider rate limited the request',
    retryable: true,
  })
})

test('does not convert cancellation into a tool result', async () => {
  const controller = new AbortController()
  controller.abort()

  await assert.rejects(
    executeTool(
      createToolCall('search', JSON.stringify({ query: 'Agent 教程' })),
      controller.signal,
    ),
    { name: 'AbortError' },
  )
})

import assert from 'node:assert/strict'
import { test } from 'node:test'

import type OpenAI from 'openai'
import type { ChatCompletionChunk } from 'openai/resources/chat/completions'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

function streamFrom(chunks: ChatCompletionChunk[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

const { createOpenAICompatibleModelClient } = await import('./openai-compatible.js')

test('converts generic model requests into OpenAI-compatible chat requests', async () => {
  const requests: {
    body: Record<string, unknown>
    signal?: AbortSignal
  }[] = []
  const openai = {
    chat: {
      completions: {
        create: async (body: Record<string, unknown>, options?: { signal?: AbortSignal }) => {
          requests.push({ body, signal: options?.signal })
          return streamFrom([
            {
              choices: [
                {
                  index: 0,
                  delta: {
                    content: '<p>Checking.</p>',
                    tool_calls: [
                      {
                        index: 0,
                        id: 'call_1',
                        type: 'function',
                        function: {
                          name: 'web_fetch',
                          arguments: '{"url":"https://example.com"}',
                        },
                      },
                    ],
                  },
                  finish_reason: 'tool_calls',
                },
              ],
              created: 0,
              id: 'chunk_1',
              model: 'openrouter/test-model',
              object: 'chat.completion.chunk',
              usage: {
                prompt_tokens: 12,
                completion_tokens: 4,
                total_tokens: 16,
              },
            },
          ] as ChatCompletionChunk[])
        },
      },
    },
  } as unknown as OpenAI

  const controller = new AbortController()
  const client = createOpenAICompatibleModelClient({
    openai,
    model: 'openrouter/test-model',
  })

  const stream = await client.streamChat({
    signal: controller.signal,
    tools: [
      {
        name: 'web_fetch',
        description: 'Fetch a URL',
        governance: {
          category: 'web',
          sideEffect: false,
          requiresAuth: false,
          timeoutMs: 10_000,
        },
        parameters: {
          type: 'object',
          properties: { url: { type: 'string' } },
          required: ['url'],
        },
      },
    ],
    messages: [
      { role: 'system', content: 'System' },
      { role: 'user', content: 'Fetch docs' },
      {
        role: 'assistant',
        content: null,
        toolCalls: [{ id: 'call_0', name: 'web_fetch', arguments: '{"url":"https://a.test"}' }],
      },
      { role: 'tool', toolCallId: 'call_0', content: 'Tool result' },
    ],
  })

  const chunks = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }

  assert.equal(requests.length, 1)
  assert.equal(requests[0]?.signal, controller.signal)
  assert.equal(requests[0]?.body.model, 'openrouter/test-model')
  assert.deepEqual(requests[0]?.body.stream_options, { include_usage: true })
  assert.equal(
    (requests[0]?.body.tools as { function: { name: string } }[] | undefined)?.[0]?.function.name,
    'web_fetch',
  )
  assert.equal(
    (requests[0]?.body.messages as { role: string; tool_calls?: unknown[] }[] | undefined)?.[2]
      ?.tool_calls?.length,
    1,
  )
  assert.deepEqual(chunks, [
    {
      choices: [
        {
          delta: {
            content: '<p>Checking.</p>',
            toolCalls: [
              {
                index: 0,
                id: 'call_1',
                name: 'web_fetch',
                argumentsDelta: '{"url":"https://example.com"}',
              },
            ],
          },
          finishReason: 'tool_calls',
        },
      ],
      usage: {
        inputTokens: 12,
        outputTokens: 4,
      },
    },
  ])
})

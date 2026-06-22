import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ModelStream } from './types.js'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

type StreamChunk = {
  choices: {
    delta?: {
      content?: string
      tool_calls?: {
        index: number
        id?: string
        function?: {
          name?: string
          arguments?: string
        }
      }[]
    }
    finish_reason?: string | null
  }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
  }
}

function streamFrom(chunks: StreamChunk[]): ModelStream {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  } as ModelStream
}

const { parseModelStream } = await import('./stream-parser.js')

test('parses streamed text, tool call argument deltas and usage', async () => {
  const events: unknown[] = []
  const result = await parseModelStream({
    stream: streamFrom([
      { choices: [{ delta: { content: '<p>Checking.</p>' } }] },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 1,
                  id: 'call_b',
                  function: { name: 'web_fetch', arguments: '{"url":"https://' },
                },
                {
                  index: 0,
                  id: 'call_a',
                  function: { name: 'github_repository_lookup', arguments: '{"repo":"' },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 1, function: { arguments: 'example.com"}' } },
                { index: 0, function: { arguments: 'slince-zero/ai-agent-pro"}' } },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 8 },
      },
    ]),
    signal: new AbortController().signal,
    onEvent: (event) => {
      events.push(event)
    },
  })

  assert.equal(result.text, '<p>Checking.</p>')
  assert.equal(result.finishReason, 'tool_calls')
  assert.deepEqual(result.usage, { inputTokens: 20, outputTokens: 8 })
  assert.equal(result.aborted, false)
  assert.deepEqual(events, [{ type: 'text', text: '<p>Checking.</p>' }])
  assert.deepEqual(result.toolCalls.get(0), {
    id: 'call_a',
    name: 'github_repository_lookup',
    arguments: '{"repo":"slince-zero/ai-agent-pro"}',
  })
  assert.deepEqual(result.toolCalls.get(1), {
    id: 'call_b',
    name: 'web_fetch',
    arguments: '{"url":"https://example.com"}',
  })
})

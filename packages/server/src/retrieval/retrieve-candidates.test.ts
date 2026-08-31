import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { RetrievalIntent } from './retrieval-intent.js'
import { retrieveCandidates } from './retrieve-candidates.js'

const intent: RetrievalIntent = {
  target: 'Agent context engineering',
  contentType: '教程',
  hardConstraints: ['适合初学者'],
  exclusions: [],
  preferences: ['使用 TypeScript'],
  ambiguities: [],
  language: null,
  timeRange: null,
}

test('searches every query and merges candidates by normalized URL', async () => {
  const receivedQueries: string[] = []

  const candidates = await retrieveCandidates(intent, new AbortController().signal, {
    search: async ({ query }) => {
      receivedQueries.push(query)

      if (query.includes('TypeScript')) {
        return [
          {
            title: 'Repeated result',
            url: 'https://example.com/guide/#examples',
            snippet: 'Preferred result snippet',
          },
          {
            title: 'TypeScript result',
            url: 'https://example.com/typescript',
            snippet: 'TypeScript snippet',
          },
        ]
      }

      return [
        {
          title: 'Primary result',
          url: 'https://example.com/guide/',
          snippet: 'Primary result snippet',
        },
      ]
    },
  })

  assert.deepEqual(receivedQueries, [
    'Agent context engineering 教程 适合初学者',
    'Agent context engineering 教程 适合初学者 使用 TypeScript',
  ])
  assert.deepEqual(candidates, [
    {
      title: 'Primary result',
      url: 'https://example.com/guide',
      snippet: 'Primary result snippet',
      matchedQueries: receivedQueries,
    },
    {
      title: 'TypeScript result',
      url: 'https://example.com/typescript',
      snippet: 'TypeScript snippet',
      matchedQueries: [receivedQueries[1]],
    },
  ])
})

test('limits the merged candidate list', async () => {
  const candidates = await retrieveCandidates(
    { ...intent, preferences: [] },
    new AbortController().signal,
    {
      search: async () =>
        Array.from({ length: 12 }, (_, index) => ({
          title: `Result ${index}`,
          url: `https://example.com/${index}`,
          snippet: `Snippet ${index}`,
        })),
    },
  )

  assert.equal(candidates.length, 10)
})

test('passes search failures to the caller', async () => {
  await assert.rejects(
    retrieveCandidates(intent, new AbortController().signal, {
      search: async () => {
        throw new Error('search failed')
      },
    }),
    /search failed/,
  )
})

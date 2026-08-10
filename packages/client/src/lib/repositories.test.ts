import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'

import { indexGitHubRepository } from './repositories.ts'

afterEach(() => mock.restoreAll())

test('indexes a GitHub repository through the authenticated API', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    Response.json({
      repository: {
        branch: 'main',
        indexedDocuments: [],
        projectId: 'slince-zero/ai-agent-pro',
        repository: 'slince-zero/ai-agent-pro',
        skippedFiles: [],
        totalChunks: 12,
      },
    }),
  )

  const result = await indexGitHubRepository('https://github.com/slince-zero/ai-agent-pro')

  assert.equal(result.projectId, 'slince-zero/ai-agent-pro')
  assert.equal(fetchMock.mock.calls[0]?.arguments[0], '/api/repositories/index')
  assert.deepEqual(JSON.parse(String(fetchMock.mock.calls[0]?.arguments[1]?.body)), {
    url: 'https://github.com/slince-zero/ai-agent-pro',
  })
})

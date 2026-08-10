import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { after, before, test } from 'node:test'

import express from 'express'

import type { AuthenticatedSession } from '../middleware/auth.js'
import type { GitHubRepoIndexer } from '../services/github-repo-indexer.js'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

const calls: unknown[] = []
const now = new Date('2026-08-10T09:00:00.000Z')

function testSession(): AuthenticatedSession {
  return {
    session: {
      id: 'auth_session_1',
      token: 'token_1',
      userId: 'user_1',
      expiresAt: now,
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    },
    user: {
      id: 'user_1',
      name: 'User one',
      email: 'user@example.com',
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    },
  }
}

const indexer = {
  indexRepository: async (input: unknown) => {
    calls.push(input)
    return {
      branch: 'main',
      indexedDocuments: [{ chunkCount: 2, documentId: 'doc_1', path: 'README.md' }],
      projectId: 'slince-zero/ai-agent-pro',
      repository: 'slince-zero/ai-agent-pro',
      skippedFiles: [],
      totalChunks: 2,
    }
  },
} as GitHubRepoIndexer

let server: Server
let baseUrl: string

before(async () => {
  const { createRequireAuth } = await import('../middleware/auth.js')
  const { createRepositoriesRouter } = await import('./repositories.js')
  const app = express()

  app.use(
    '/api',
    createRequireAuth({
      getSession: async (headers) => (headers.get('x-test-user') ? testSession() : null),
    }),
  )
  app.use(express.json())
  app.use((req, _res, next) => {
    req.log = { error() {} } as unknown as typeof req.log
    next()
  })
  app.use('/api/repositories', createRepositoriesRouter({ indexer }))

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object')
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

function indexRequest(body: unknown, authenticated = true) {
  return fetch(`${baseUrl}/api/repositories/index`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authenticated ? { 'x-test-user': 'user_1' } : {}),
    },
    body: JSON.stringify(body),
  })
}

test('requires authentication', async () => {
  const response = await indexRequest({ url: 'https://github.com/openai/openai-node' }, false)
  assert.equal(response.status, 401)
})

test('indexes a public GitHub repository for the current user', async () => {
  const response = await indexRequest({ url: 'https://github.com/slince-zero/ai-agent-pro' })
  const body = (await response.json()) as { repository: { projectId: string } }

  assert.equal(response.status, 201)
  assert.equal(body.repository.projectId, 'slince-zero/ai-agent-pro')
  assert.deepEqual(calls.at(-1), {
    userId: 'user_1',
    owner: 'slince-zero',
    repo: 'ai-agent-pro',
    branch: undefined,
  })
})

test('rejects non-repository and non-GitHub URLs', async () => {
  for (const url of ['https://example.com/owner/repo', 'https://github.com/owner/repo/issues']) {
    const response = await indexRequest({ url })
    assert.equal(response.status, 422)
    assert.equal(
      ((await response.json()) as { code: string }).code,
      'INVALID_GITHUB_REPOSITORY_URL',
    )
  }
})

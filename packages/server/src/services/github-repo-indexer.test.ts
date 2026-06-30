import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { DocumentService } from './document-service.js'
import type { GitHubRepoClient, GitHubTreeEntry } from './github-repo-indexer.js'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

const {
  chunkTextForIndex,
  createGitHubRepoIndexer,
  isIndexableGitHubFile,
  selectIndexableGitHubFiles,
} = await import('./github-repo-indexer.js')

function base64(content: string) {
  return Buffer.from(content).toString('base64')
}

function createFakeGitHubClient(): {
  calls: {
    files: string[]
    repos: unknown[]
    trees: unknown[]
  }
  githubClient: GitHubRepoClient
} {
  const calls = {
    files: [] as string[],
    repos: [] as unknown[],
    trees: [] as unknown[],
  }
  const contents: Record<string, string> = {
    'README.md': '# Project\n\nUse pnpm.',
    'package.json': '{"name":"ai-agent-pro"}',
    'packages/server/src/app.ts': 'export function app() {\n  return true\n}\n',
  }
  const githubClient: GitHubRepoClient = {
    getRepository: async (input) => {
      calls.repos.push(input)
      return {
        defaultBranch: 'main',
        fullName: 'slince-zero/ai-agent-pro',
        htmlUrl: 'https://github.com/slince-zero/ai-agent-pro',
      }
    },
    getTree: async (input) => {
      calls.trees.push(input)
      return [
        { path: 'README.md', type: 'blob', sha: 'sha_readme', size: contents['README.md']?.length },
        {
          path: 'package.json',
          type: 'blob',
          sha: 'sha_pkg',
          size: contents['package.json']?.length,
        },
        { path: 'packages', type: 'tree' },
        {
          path: 'packages/server/src/app.ts',
          type: 'blob',
          sha: 'sha_app',
          size: contents['packages/server/src/app.ts']?.length,
        },
        { path: 'packages/server/src/generated/prisma/client.ts', type: 'blob', size: 20 },
        { path: 'packages/server/dist/index.js', type: 'blob', size: 20 },
        { path: 'public/logo.png', type: 'blob', size: 20 },
      ]
    },
    getFileContent: async ({ path }) => {
      calls.files.push(path)
      const content = contents[path]
      if (!content) throw new Error(`missing fixture for ${path}`)

      return {
        content: base64(content),
        encoding: 'base64',
        htmlUrl: `https://github.com/slince-zero/ai-agent-pro/blob/main/${path}`,
        path,
        sha: `content_${path}`,
        size: content.length,
      }
    },
  }

  return { calls, githubClient }
}

function createFakeDocumentService() {
  const calls = {
    creates: [] as unknown[],
    replacements: [] as unknown[],
  }
  let documentId = 0
  const documentService = {
    createDocument: async (input: unknown) => {
      calls.creates.push(input)
      documentId += 1
      return {
        id: `document_${documentId}`,
        ...(input as Record<string, unknown>),
      }
    },
    replaceDocumentChunks: async (input: unknown) => {
      calls.replacements.push(input)
      return {
        id: (input as { documentId: string }).documentId,
      }
    },
  } as unknown as DocumentService

  return { calls, documentService }
}

test('selects README, package manifests and whitelisted source files', () => {
  const entries: GitHubTreeEntry[] = [
    { path: 'public/logo.png', type: 'blob', size: 10 },
    { path: 'node_modules/pkg/index.ts', type: 'blob', size: 10 },
    { path: 'README.md', type: 'blob', size: 10 },
    { path: 'packages/server/src/app.ts', type: 'blob', size: 10 },
    { path: 'package.json', type: 'blob', size: 10 },
    { path: 'packages/server/src/generated/client.ts', type: 'blob', size: 10 },
  ]

  assert.equal(isIndexableGitHubFile(entries[0]!), false)
  assert.deepEqual(
    selectIndexableGitHubFiles(entries, { maxFileBytes: 100, maxFiles: 10 }).map(
      (entry) => entry.path,
    ),
    ['README.md', 'package.json', 'packages/server/src/app.ts'],
  )
})

test('chunks text on newline boundaries with offsets', () => {
  assert.deepEqual(chunkTextForIndex('alpha\nbeta\ngamma', 11), [
    { content: 'alpha\nbeta', endOffset: 11, startOffset: 0 },
    { content: 'gamma', endOffset: 16, startOffset: 11 },
  ])
})

test('indexes GitHub repository tree and selected files into documents', async () => {
  const { calls: githubCalls, githubClient } = createFakeGitHubClient()
  const { calls: documentCalls, documentService } = createFakeDocumentService()
  const indexer = createGitHubRepoIndexer({
    documentService,
    githubClient,
    now: () => new Date('2026-06-30T08:00:00.000Z'),
    options: {
      maxChunkChars: 50,
      maxFiles: 10,
    },
  })

  const result = await indexer.indexRepository({
    userId: 'user_1',
    owner: 'slince-zero',
    repo: 'ai-agent-pro',
  })

  assert.deepEqual(githubCalls.files, ['README.md', 'package.json', 'packages/server/src/app.ts'])
  assert.equal(result.repository, 'slince-zero/ai-agent-pro')
  assert.equal(result.branch, 'main')
  assert.equal(result.projectId, 'slince-zero/ai-agent-pro')
  assert.deepEqual(
    result.indexedDocuments.map((document) => document.path),
    ['__tree__', 'README.md', 'package.json', 'packages/server/src/app.ts'],
  )
  assert.equal(result.skippedFiles.length, 0)
  assert.deepEqual(documentCalls.creates[0], {
    userId: 'user_1',
    projectId: 'slince-zero/ai-agent-pro',
    source: 'github',
    externalId: 'slince-zero/ai-agent-pro:main:__tree__',
    title: 'slince-zero/ai-agent-pro directory tree',
    uri: 'https://github.com/slince-zero/ai-agent-pro/tree/main',
    mimeType: 'text/plain',
    contentHash: (documentCalls.creates[0] as { contentHash: string }).contentHash,
    metadata: {
      branch: 'main',
      indexedAt: '2026-06-30T08:00:00.000Z',
      kind: 'directory_tree',
      owner: 'slince-zero',
      path: '__tree__',
      repo: 'ai-agent-pro',
      sha: undefined,
      size: undefined,
    },
  })
  assert.deepEqual(
    documentCalls.creates.map((create) => (create as { externalId: string }).externalId),
    [
      'slince-zero/ai-agent-pro:main:__tree__',
      'slince-zero/ai-agent-pro:main:README.md',
      'slince-zero/ai-agent-pro:main:package.json',
      'slince-zero/ai-agent-pro:main:packages/server/src/app.ts',
    ],
  )
  assert.deepEqual(
    documentCalls.replacements.map(
      (replacement) => (replacement as { chunks: { sourceRef: string }[] }).chunks[0]?.sourceRef,
    ),
    ['__tree__#L1-L2', 'README.md#L1-L3', 'package.json#L1-L1', 'packages/server/src/app.ts#L1-L3'],
  )
  assert.equal(
    (documentCalls.replacements[0] as { chunks: { sourceRef: string }[] }).chunks.length > 1,
    true,
  )
})

test('records skipped files when GitHub content cannot be decoded', async () => {
  const { githubClient } = createFakeGitHubClient()
  const { calls, documentService } = createFakeDocumentService()
  const indexer = createGitHubRepoIndexer({
    documentService,
    githubClient: {
      ...githubClient,
      getFileContent: async (input) => {
        if (input.path === 'README.md') {
          return {
            content: 'plain text',
            encoding: 'utf-8',
            path: input.path,
          }
        }

        return githubClient.getFileContent(input)
      },
    },
  })

  const result = await indexer.indexRepository({
    userId: 'user_1',
    owner: 'slince-zero',
    repo: 'ai-agent-pro',
  })

  assert.deepEqual(result.skippedFiles, ['README.md'])
  assert.equal(
    calls.creates.some((create) =>
      (create as { externalId: string }).externalId.endsWith(':README.md'),
    ),
    false,
  )
})

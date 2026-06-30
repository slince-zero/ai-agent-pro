import { createHash } from 'node:crypto'

import { env } from '../env.js'
import { type DocumentService, createDocumentService } from './document-service.js'

const DEFAULT_MAX_FILES = 80
const DEFAULT_MAX_FILE_BYTES = 120_000
const DEFAULT_MAX_CHUNK_CHARS = 4_000
const DEFAULT_MAX_TREE_ENTRIES = 500

const DIRECTORY_TREE_PATH = '__tree__'
const IGNORED_PATH_PARTS = new Set([
  '.git',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'generated',
  'node_modules',
  'out',
])
const MANIFEST_NAMES = new Set([
  'package.json',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'tsconfig.json',
  'vite.config.ts',
  'vite.config.js',
  'next.config.ts',
  'next.config.js',
])
const SOURCE_DIRECTORIES = new Set([
  'app',
  'client',
  'components',
  'docs',
  'lib',
  'packages',
  'pages',
  'prisma',
  'scripts',
  'server',
  'src',
  'test',
  'tests',
])
const INDEXABLE_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mdx',
  '.mjs',
  '.prisma',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
])

type GitHubRepositoryApiResponse = {
  default_branch?: unknown
  full_name?: unknown
  html_url?: unknown
}

type GitHubTreeApiResponse = {
  tree?: unknown
  truncated?: unknown
}

type GitHubContentApiResponse = {
  content?: unknown
  encoding?: unknown
  html_url?: unknown
  path?: unknown
  sha?: unknown
  size?: unknown
}

export type GitHubRepository = {
  defaultBranch: string
  fullName: string
  htmlUrl: string
}

export type GitHubTreeEntry = {
  path: string
  type: string
  sha?: string
  size?: number
}

export type GitHubFileContent = {
  content: string
  encoding: string
  htmlUrl?: string
  path: string
  sha?: string
  size?: number
}

export type GitHubRepoClient = {
  getRepository: (input: GitHubRepoClientInput) => Promise<GitHubRepository>
  getTree: (input: GitHubRepoTreeInput) => Promise<GitHubTreeEntry[]>
  getFileContent: (input: GitHubRepoFileInput) => Promise<GitHubFileContent>
}

export type GitHubRepoClientInput = {
  owner: string
  repo: string
  token?: string
}

export type GitHubRepoTreeInput = GitHubRepoClientInput & {
  ref: string
}

export type GitHubRepoFileInput = GitHubRepoTreeInput & {
  path: string
}

export type GitHubRepoIndexerOptions = {
  maxChunkChars: number
  maxFileBytes: number
  maxFiles: number
  maxTreeEntries: number
}

export type CreateGitHubRepoIndexerDeps = {
  documentService?: DocumentService
  githubClient?: GitHubRepoClient
  now?: () => Date
  options?: Partial<GitHubRepoIndexerOptions>
}

export type IndexGitHubRepositoryInput = {
  userId: string
  owner: string
  repo: string
  branch?: string
  projectId?: string
  token?: string
}

export type IndexedDocumentResult = {
  chunkCount: number
  documentId: string
  path: string
}

export type IndexGitHubRepositoryResult = {
  branch: string
  indexedDocuments: IndexedDocumentResult[]
  projectId: string
  repository: string
  skippedFiles: string[]
  totalChunks: number
}

type PreparedDocument = {
  content: string
  contentHash: string
  kind: 'directory_tree' | 'source_file'
  path: string
  sha?: string
  size?: number
  title: string
  uri: string
}

function assertNonEmpty(value: string | undefined | null, field: string) {
  if (!value || !value.trim()) {
    throw new Error(`${field} is required`)
  }
}

function normalizeOptions(
  options: Partial<GitHubRepoIndexerOptions> = {},
): GitHubRepoIndexerOptions {
  return {
    maxChunkChars: toPositiveInteger(options.maxChunkChars, DEFAULT_MAX_CHUNK_CHARS),
    maxFileBytes: toPositiveInteger(options.maxFileBytes, DEFAULT_MAX_FILE_BYTES),
    maxFiles: toPositiveInteger(options.maxFiles, DEFAULT_MAX_FILES),
    maxTreeEntries: toPositiveInteger(options.maxTreeEntries, DEFAULT_MAX_TREE_ENTRIES),
  }
}

function toPositiveInteger(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || value == null) return fallback

  const normalized = Math.floor(value)
  return normalized > 0 ? normalized : fallback
}

function stableSha256(content: string) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function encodePath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/')
}

function githubBlobUrl(owner: string, repo: string, branch: string, path: string) {
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(
    repo,
  )}/blob/${encodeURIComponent(branch)}/${encodePath(path)}`
}

function githubTreeUrl(owner: string, repo: string, branch: string) {
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(
    repo,
  )}/tree/${encodeURIComponent(branch)}`
}

function extensionForPath(path: string) {
  const basename = path.split('/').at(-1) ?? path
  const dotIndex = basename.lastIndexOf('.')
  return dotIndex >= 0 ? basename.slice(dotIndex).toLowerCase() : ''
}

function basenameForPath(path: string) {
  return path.split('/').at(-1)?.toLowerCase() ?? path.toLowerCase()
}

function isReadme(path: string) {
  return /^readme(?:\.[a-z0-9_-]+)?$/i.test(basenameForPath(path))
}

function hasIgnoredPathPart(path: string) {
  return path
    .split('/')
    .map((part) => part.toLowerCase())
    .some((part) => IGNORED_PATH_PARTS.has(part))
}

function startsInSourceDirectory(path: string) {
  const firstPart = path.split('/')[0]?.toLowerCase()
  return Boolean(firstPart && SOURCE_DIRECTORIES.has(firstPart))
}

export function isIndexableGitHubFile(
  entry: GitHubTreeEntry,
  maxFileBytes = DEFAULT_MAX_FILE_BYTES,
) {
  if (entry.type !== 'blob') return false
  if (hasIgnoredPathPart(entry.path)) return false
  if (entry.size != null && entry.size > maxFileBytes) return false

  const basename = basenameForPath(entry.path)
  if (isReadme(entry.path)) return true
  if (MANIFEST_NAMES.has(basename)) return true

  return (
    startsInSourceDirectory(entry.path) && INDEXABLE_EXTENSIONS.has(extensionForPath(entry.path))
  )
}

function pathPriority(entry: GitHubTreeEntry) {
  const path = entry.path.toLowerCase()
  const basename = basenameForPath(path)

  if (isReadme(path)) return 0
  if (basename === 'package.json') return 1
  if (MANIFEST_NAMES.has(basename)) return 2
  if (path.startsWith('docs/')) return 3
  if (path.includes('/src/') || path.startsWith('src/')) return 4
  return 5
}

export function selectIndexableGitHubFiles(
  entries: GitHubTreeEntry[],
  options: Pick<GitHubRepoIndexerOptions, 'maxFileBytes' | 'maxFiles'>,
) {
  return entries
    .filter((entry) => isIndexableGitHubFile(entry, options.maxFileBytes))
    .toSorted((a, b) => pathPriority(a) - pathPriority(b) || a.path.localeCompare(b.path))
    .slice(0, options.maxFiles)
}

function lineForOffset(content: string, offset: number) {
  if (offset <= 0) return 1
  return content.slice(0, Math.min(offset, content.length)).split('\n').length
}

function sourceRefForChunk(path: string, content: string, startOffset: number, endOffset: number) {
  const startLine = lineForOffset(content, startOffset)
  const endLine = lineForOffset(content, Math.max(startOffset, endOffset - 1))
  return `${path}#L${startLine}-L${endLine}`
}

export function chunkTextForIndex(content: string, maxChunkChars = DEFAULT_MAX_CHUNK_CHARS) {
  const normalized = content.replace(/\r\n/g, '\n').trim()
  const chunks: {
    content: string
    endOffset: number
    startOffset: number
  }[] = []
  if (!normalized) return chunks

  let startOffset = 0
  while (startOffset < normalized.length) {
    let endOffset = Math.min(startOffset + maxChunkChars, normalized.length)

    if (endOffset < normalized.length) {
      const newlineIndex = normalized.lastIndexOf('\n', endOffset)
      if (newlineIndex > startOffset + Math.floor(maxChunkChars * 0.6)) {
        endOffset = newlineIndex + 1
      }
    }

    const chunkContent = normalized.slice(startOffset, endOffset).trim()
    if (chunkContent) {
      chunks.push({
        content: chunkContent,
        endOffset,
        startOffset,
      })
    }
    startOffset = endOffset
  }

  return chunks
}

function formatDirectoryTree(entries: GitHubTreeEntry[], maxTreeEntries: number) {
  const visibleEntries = entries
    .filter((entry) => !hasIgnoredPathPart(entry.path))
    .toSorted((a, b) => a.path.localeCompare(b.path))
    .slice(0, maxTreeEntries)

  return visibleEntries
    .map((entry) => `${entry.type === 'tree' ? 'dir ' : 'file'} ${entry.path}`)
    .join('\n')
}

function decodeFileContent(file: GitHubFileContent) {
  if (file.encoding !== 'base64') {
    throw new Error(`Unsupported GitHub file encoding for ${file.path}: ${file.encoding}`)
  }

  return Buffer.from(file.content.replace(/\s+/g, ''), 'base64').toString('utf8')
}

function mimeTypeForPath(path: string) {
  const extension = extensionForPath(path)
  if (extension === '.md' || extension === '.mdx') return 'text/markdown'
  if (extension === '.json') return 'application/json'
  if (extension === '.yaml' || extension === '.yml') return 'application/yaml'
  if (extension === '.css') return 'text/css'
  if (extension === '.html') return 'text/html'
  return 'text/plain'
}

function toDocumentExternalId(repository: string, branch: string, path: string) {
  return `${repository}:${branch}:${path}`
}

async function fetchGitHubJson<T>(url: string, token?: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token || env.GITHUB_TOKEN
        ? { Authorization: `Bearer ${token ?? env.GITHUB_TOKEN}` }
        : {}),
      'User-Agent': 'ai-pro-agent',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!response.ok) {
    throw new Error(`GitHub API request failed: HTTP ${response.status}`)
  }

  return (await response.json()) as T
}

function toStringValue(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function toNumberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function toTreeEntries(value: unknown): GitHubTreeEntry[] {
  if (!Array.isArray(value)) return []

  const entries: GitHubTreeEntry[] = []
  for (const entry of value) {
    const candidate = entry as Record<string, unknown>
    const path = toStringValue(candidate.path)
    const type = toStringValue(candidate.type)
    if (!path || !type) continue

    const normalizedEntry: GitHubTreeEntry = {
      path,
      type,
    }
    const sha = toStringValue(candidate.sha)
    const size = toNumberValue(candidate.size)
    if (sha) normalizedEntry.sha = sha
    if (size != null) normalizedEntry.size = size

    entries.push(normalizedEntry)
  }

  return entries
}

export function createGitHubRepoClient(): GitHubRepoClient {
  return {
    async getRepository({ owner, repo, token }) {
      const data = await fetchGitHubJson<GitHubRepositoryApiResponse>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        token,
      )

      return {
        defaultBranch: toStringValue(data.default_branch, 'main'),
        fullName: toStringValue(data.full_name, `${owner}/${repo}`),
        htmlUrl: toStringValue(data.html_url, `https://github.com/${owner}/${repo}`),
      }
    },

    async getTree({ owner, repo, ref, token }) {
      const data = await fetchGitHubJson<GitHubTreeApiResponse>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
        token,
      )

      if (data.truncated === true) {
        throw new Error('GitHub repository tree is truncated; narrow the indexing scope')
      }

      return toTreeEntries(data.tree)
    },

    async getFileContent({ owner, repo, ref, path, token }) {
      const data = await fetchGitHubJson<GitHubContentApiResponse>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
        token,
      )

      return {
        content: toStringValue(data.content),
        encoding: toStringValue(data.encoding),
        htmlUrl: toStringValue(data.html_url) || undefined,
        path: toStringValue(data.path, path),
        sha: toStringValue(data.sha) || undefined,
        size: toNumberValue(data.size),
      }
    },
  }
}

export function createGitHubRepoIndexer({
  documentService = createDocumentService(),
  githubClient = createGitHubRepoClient(),
  now = () => new Date(),
  options = {},
}: CreateGitHubRepoIndexerDeps = {}) {
  const resolvedOptions = normalizeOptions(options)

  async function storePreparedDocument(
    input: IndexGitHubRepositoryInput,
    repository: GitHubRepository,
    branch: string,
    projectId: string,
    preparedDocument: PreparedDocument,
  ): Promise<IndexedDocumentResult | null> {
    const chunks = chunkTextForIndex(preparedDocument.content, resolvedOptions.maxChunkChars).map(
      (chunk, index) => ({
        chunkIndex: index,
        content: chunk.content,
        contentHash: stableSha256(chunk.content),
        sourceRef: sourceRefForChunk(
          preparedDocument.path,
          preparedDocument.content,
          chunk.startOffset,
          chunk.endOffset,
        ),
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        metadata: {
          branch,
          kind: preparedDocument.kind,
          owner: input.owner,
          path: preparedDocument.path,
          repo: input.repo,
          sha: preparedDocument.sha,
        },
      }),
    )
    if (chunks.length === 0) return null

    const document = await documentService.createDocument({
      userId: input.userId,
      projectId,
      source: 'github',
      externalId: toDocumentExternalId(repository.fullName, branch, preparedDocument.path),
      title: preparedDocument.title,
      uri: preparedDocument.uri,
      mimeType: mimeTypeForPath(preparedDocument.path),
      contentHash: preparedDocument.contentHash,
      metadata: {
        branch,
        indexedAt: now().toISOString(),
        kind: preparedDocument.kind,
        owner: input.owner,
        path: preparedDocument.path,
        repo: input.repo,
        sha: preparedDocument.sha,
        size: preparedDocument.size,
      },
    })

    await documentService.replaceDocumentChunks({
      userId: input.userId,
      documentId: document.id,
      chunks,
    })

    return {
      chunkCount: chunks.length,
      documentId: document.id,
      path: preparedDocument.path,
    }
  }

  return {
    async indexRepository(input: IndexGitHubRepositoryInput): Promise<IndexGitHubRepositoryResult> {
      assertNonEmpty(input.userId, 'userId')
      assertNonEmpty(input.owner, 'owner')
      assertNonEmpty(input.repo, 'repo')

      const repository = await githubClient.getRepository(input)
      const branch = input.branch?.trim() || repository.defaultBranch
      const projectId = input.projectId?.trim() || repository.fullName
      const treeEntries = await githubClient.getTree({ ...input, ref: branch })
      const selectedFiles = selectIndexableGitHubFiles(treeEntries, resolvedOptions)
      const indexedDocuments: IndexedDocumentResult[] = []
      const skippedFiles: string[] = []

      const treeContent = formatDirectoryTree(treeEntries, resolvedOptions.maxTreeEntries)
      const preparedDocuments: PreparedDocument[] = treeContent
        ? [
            {
              content: treeContent,
              contentHash: stableSha256(treeContent),
              kind: 'directory_tree',
              path: DIRECTORY_TREE_PATH,
              title: `${repository.fullName} directory tree`,
              uri: githubTreeUrl(input.owner, input.repo, branch),
            },
          ]
        : []

      for (const entry of selectedFiles) {
        try {
          const file = await githubClient.getFileContent({
            ...input,
            path: entry.path,
            ref: branch,
          })
          const content = decodeFileContent(file)
          preparedDocuments.push({
            content,
            contentHash: stableSha256(content),
            kind: 'source_file',
            path: entry.path,
            sha: file.sha ?? entry.sha,
            size: file.size ?? entry.size,
            title: entry.path,
            uri: file.htmlUrl ?? githubBlobUrl(input.owner, input.repo, branch, entry.path),
          })
        } catch {
          skippedFiles.push(entry.path)
        }
      }

      for (const preparedDocument of preparedDocuments) {
        const result = await storePreparedDocument(
          input,
          repository,
          branch,
          projectId,
          preparedDocument,
        )
        if (result) indexedDocuments.push(result)
      }

      return {
        branch,
        indexedDocuments,
        projectId,
        repository: repository.fullName,
        skippedFiles,
        totalChunks: indexedDocuments.reduce((sum, document) => sum + document.chunkCount, 0),
      }
    },
  }
}

export type GitHubRepoIndexer = ReturnType<typeof createGitHubRepoIndexer>

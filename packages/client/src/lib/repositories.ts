import { apiFetch, parseJsonResponse } from '@/lib/api'

export type IndexedRepository = {
  branch: string
  indexedDocuments: { chunkCount: number; documentId: string; path: string }[]
  projectId: string
  repository: string
  skippedFiles: string[]
  totalChunks: number
}

type IndexRepositoryResponse = {
  repository: IndexedRepository
}

export async function indexGitHubRepository(url: string) {
  const response = await apiFetch('/api/repositories/index', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  })
  const data = await parseJsonResponse<IndexRepositoryResponse>(response)
  return data.repository
}

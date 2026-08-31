import { agentLimits } from '../agent-limits.js'
import { search } from '../tools/search.js'
import type { SearchResult } from '../tools/search.js'
import { buildSearchQueries } from './build-search-queries.js'
import type { RetrievalIntent } from './retrieval-intent.js'

export type RetrievalCandidate = SearchResult & {
  matchedQueries: string[]
}

type SearchRequest = typeof search

type RetrieveCandidatesDependencies = {
  search?: SearchRequest
}

function normalizeUrl(value: string): string {
  const url = new URL(value)
  url.hash = ''

  if (url.pathname !== '/') {
    url.pathname = url.pathname.replace(/\/$/, '')
  }

  return url.toString()
}

export async function retrieveCandidates(
  intent: RetrievalIntent,
  signal: AbortSignal,
  dependencies: RetrieveCandidatesDependencies = {},
): Promise<RetrievalCandidate[]> {
  signal.throwIfAborted()

  const queries = buildSearchQueries(intent)
  const runSearch = dependencies.search ?? search
  const resultGroups = await Promise.all(
    queries.map(async (query) => ({
      query,
      results: await runSearch({ query }, signal),
    })),
  )
  const candidates = new Map<string, RetrievalCandidate>()

  for (const { query, results } of resultGroups) {
    for (const result of results) {
      const normalizedUrl = normalizeUrl(result.url)
      const existingCandidate = candidates.get(normalizedUrl)

      if (existingCandidate) {
        existingCandidate.matchedQueries.push(query)
        continue
      }

      candidates.set(normalizedUrl, {
        ...result,
        url: normalizedUrl,
        matchedQueries: [query],
      })
    }
  }

  return [...candidates.values()].slice(0, agentLimits.maxCandidates)
}

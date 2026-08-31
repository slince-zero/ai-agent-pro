import { agentLimits } from '../util.js'
import type { RetrievalIntent } from './retrieval-intent.js'

const MAX_QUERY_LENGTH = 200

function joinQueryParts(parts: Array<string | null>): string {
  const uniqueParts = [...new Set(parts.filter((part): part is string => part !== null))]

  return uniqueParts.join(' ').slice(0, MAX_QUERY_LENGTH).trim()
}

export function buildSearchQueries(intent: RetrievalIntent): string[] {
  const requiredParts = [
    intent.target,
    intent.contentType,
    ...intent.hardConstraints,
    intent.language,
    intent.timeRange,
  ]
  const primaryQuery = joinQueryParts(requiredParts)
  const preferredQuery = joinQueryParts([...requiredParts, ...intent.preferences])

  return [...new Set([primaryQuery, preferredQuery])].slice(0, agentLimits.maxInitialSearchQueries)
}

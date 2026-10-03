import type { RetrievalIntent, RetrievalTask } from '@ai-agent-pro/shared/type.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isIntent(value: unknown): value is RetrievalIntent {
  if (!isRecord(value) || typeof value.target !== 'string' || !value.target.trim()) return false
  const lists = ['hardConstraints', 'exclusions', 'preferences', 'ambiguities'] as const
  const scalars = ['contentType', 'language', 'timeRange'] as const
  return (
    lists.every(
      (key) =>
        Array.isArray(value[key]) &&
        value[key].every((item) => typeof item === 'string' && item.trim()),
    ) && scalars.every((key) => value[key] === null || typeof value[key] === 'string')
  )
}

export function isRetrievalTask(value: unknown): value is RetrievalTask {
  if (!isRecord(value)) return false
  if (value.mode === 'chat') return true
  if (!isIntent(value.intent)) return false
  if (value.mode === 'retrieve') return value.intent.ambiguities.length === 0
  return (
    value.mode === 'clarify' && typeof value.question === 'string' && Boolean(value.question.trim())
  )
}

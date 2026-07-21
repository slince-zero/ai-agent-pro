import { apiFetch, parseJsonResponse } from '@/lib/api'
import type { RunTrace } from '@/types/runs'

type RunsResponse = {
  runs: RunTrace[]
}

type RunResponse = {
  run: RunTrace
}

export async function fetchRuns() {
  const response = await apiFetch('/api/runs')
  const data = await parseJsonResponse<RunsResponse>(response)
  return data.runs
}

export async function fetchRunTrace(runId: string) {
  const response = await apiFetch(`/api/runs/${runId}`)
  const data = await parseJsonResponse<RunResponse>(response)
  return data.run
}

import type { RunTrace } from '@/types/runs'

type RunsResponse = {
  runs: RunTrace[]
}

type RunResponse = {
  run: RunTrace
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    return (await response.json()) as T
  }

  const text = await response.text()
  throw new Error(text || `HTTP ${response.status}`)
}

export async function fetchRuns() {
  const response = await fetch('/api/runs')
  const data = await parseJsonResponse<RunsResponse>(response)
  return data.runs
}

export async function fetchRunTrace(runId: string) {
  const response = await fetch(`/api/runs/${runId}`)
  const data = await parseJsonResponse<RunResponse>(response)
  return data.run
}

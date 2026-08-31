import { inspect } from 'node:util'

export function reportErrorLog(error: unknown) {
  process.stderr.write(inspect(error, { depth: 5, colors: true }) + '\n')
}

export const agentLimits = {
  maxRounds: 4,
  maxInitialSearchQueries: 2,
  maxSearchCalls: 3,
  maxPageReads: 5,
  maxCandidates: 10,
  maxPageContentLength: 20_000,
} as const

export const agentLimits = {
  maxRounds: 4,
  maxInitialSearchQueries: 2,
  maxSearchCalls: 3,
  maxPageReads: 5,
  maxCandidates: 10,
  maxPageContentLength: 20_000,
} as const

import { inspect } from 'node:util'

export function reportErrorLog(error: unknown) {
  process.stderr.write(inspect(error, { depth: 5, colors: true }) + '\n')
}

export const agentLimits = {
  // 只有 round < maxRounds 的轮次带 tools，所以能调工具的轮数是 maxRounds - 1。
  // 让每类工具的预算（而不是轮数）成为真正的约束条件。
  maxRounds: 8,
  maxInitialSearchQueries: 2,
  maxSearchCalls: 3,
  maxPageReads: 5,
  maxCandidates: 10,
  maxPageContentLength: 20_000,
} as const

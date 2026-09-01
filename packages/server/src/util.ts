import { inspect } from 'node:util'

export function reportErrorLog(error: unknown) {
  process.stderr.write(inspect(error, { depth: 5, colors: true }) + '\n')
}

export const agentLimits = {
  // 只有 round < maxRounds 的轮次带 tools，所以能调工具的轮数是 maxRounds - 1。
  // 让每类工具的预算（而不是轮数）成为真正的约束条件。
  maxRounds: 8,
  maxInitialSearchQueries: 2,
  /*
   * 搜索的预算按"一个问题里能有几个待查的子问题"定，不是按轮数定：
   * "对比这五个框架"一上来就是五次并行搜索，给 3 次等于逼它半途改口。
   * 一次 search 只带回 5 条摘要（约 500 token），10 次也就 5k，撐得住。
   */
  maxSearchCalls: 10,
  /*
   * 读页面反而要克制：一页最多 20 000 字符（约 7k token），6 页就吃掉 40k 上下文。
   * 页面正文是这里唯一的实证据，宁可少读几页也不要把前面的证据挤出窗口。
   */
  maxPageReads: 6,
  maxCandidates: 10,
  maxPageContentLength: 20_000,
} as const

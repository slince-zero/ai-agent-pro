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
  /*
   * 上下文里能同时放多少页正文。
   *
   * 页面正文是这里唯一会失控增长的东西：6 页各两万字符就是 12 万字符（约 40k token），
   * 而且每一轮都要重发一遍。所以给正文单独一个预算——大约三页——超出的部分按
   * "越旧越先降级"换成开头一段摘录，其余的靠模型自己在读完时写下的结论留住。
   * 提示词里那条"读完一页先写结论"就是为这件事服务的。
   *
   * 别的部分本来就有界：客户端消息受 express.json 的 16kb 限制，搜索结果每次最多
   * 5 条裁短过的命中，10 次加起来也就几千字符。
   */
  maxPageContextLength: 60_000,
  /** 正文被挤出上下文后留下的开头长度：够认出这是哪一页，不够当证据用 */
  pageExcerptLength: 600,
} as const

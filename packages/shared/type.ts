export type TokenUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * 一条搜索命中在界面上的样子。
 *
 * 它不是证据本身——摘要只够初筛，正文要靠 read_page 读回来。所以这里只带几样
 * 足够让人判断"值不值得点进去"的东西：能打开的地址、标题、一句摘要。
 */
export type ToolSource = {
  /**
   * 这一次运行给这个地址的引用编号，答案里的 [1] 指的就是它。
   *
   * 编号由服务端按"第一次见到"的顺序分配，同一个地址在整次运行里永远是同一个号，
   * 所以它既能给模型引用，也能让界面把答案里的标记和时间轴上的来源对上。
   * 不用列表下标：同一个地址会在多次搜索里重复出现，下标每次都不一样。
   */
  ref: number
  title: string
  url: string
  snippet: string
}

/**
 * 一次运行用到的全部来源。
 *
 * 搜索的命中是逐次到达的，read_page 读过的地址还可能压根不在任何一次搜索里，
 * 所以答案下面那份来源清单没法边流边拼——收尾时由服务端一次给全。
 */
export type EvidenceSource = ToolSource & {
  /** 正文被 read_page 真的读回来过：只有这样的来源才够支撑具体断言 */
  read: boolean
  /** 读回的正文字符数，read 为 true 时才有 */
  chars?: number
}

export type AgentStreamEvent =
  | {
      type: 'text_delta'
      delta: string
    }
  | {
      /**
       * 思维链分片。
       *
       * 和 text_delta 分开成两个事件，因为它们的归属不同：思维链属于"模型在这一轮
       * 怎么想的"，正文属于对话本身。混进一个通道，客户端就再也分不开，
       * 复制回答时会把一整段推理也复制进去。
       */
      type: 'reasoning_delta'
      delta: string
    }
  | {
      type: 'usage'
      usage: TokenUsage
    }
  | {
      /**
       * 新一轮循环开始。
       *
       * 客户端靠它把"我先搜一下"这类过程话术和最终答案切开——
       * 否则所有轮次的 text_delta 会拼进同一个缓冲区，工具调用链就没有落脚点。
       */
      type: 'round_start'
      round: number
    }
  | {
      type: 'tool_call'
      id: string
      name: string
      arguments: string
    }
  | {
      type: 'tool_result'
      id: string
      name: string
      ok: boolean
      /**
       * 结果的一行摘要，比如"5 条结果：TypeScript Handbook…"。
       *
       * 完整结果只进服务端的账本：它动辄两万字符，而且是给模型读的。
       * 界面要的是"这一步到底拿回了什么"，所以摘要由服务端从结果里提炼，
       * 不让客户端去解析工具的原始 JSON。
       */
      preview?: string
      /**
       * search 的命中列表：最多 5 条，标题和摘要都已裁短。
       *
       * 只有 search 有这一项。read_page 的正文上限两万字符，是这里唯一的实证据，
       * 它继续只给一行摘要——推到客户端既没人读得完，也等于把证据交到了客户端手上。
       */
      sources?: ToolSource[]
    }
  | {
      /**
       * 这一次运行用到的全部来源，带引用编号。
       *
       * 答案里的 [1] 要能点开，客户端就得有一份编号到地址的映射；这份映射只有
       * 服务端的账本知道，所以在 done 之前一次给全，而不是让客户端自己从
       * 各次搜索的结果里去拼——拼出来的编号和模型看到的编号未必是同一套。
       */
      type: 'evidence'
      sources: EvidenceSource[]
    }
  | {
      type: 'done'
    }

export type MessageStreamEvent =
  | AgentStreamEvent
  | {
      type: 'error'
      message: string
    }

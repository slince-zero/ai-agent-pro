export type TokenUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
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

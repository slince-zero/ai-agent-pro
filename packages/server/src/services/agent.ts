import type OpenAI from 'openai'
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions'
import type pino from 'pino'

import { getSystemPrompt } from '../prompts/system.js'
import { getOpenAITools, runTool } from '../tools/index.js'
import type { ClientMessage } from '../types/chat.js'
import { MODEL } from './openai.js'

const MAX_ITERATIONS = 6

export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; toolCallId: string; name: string; args: unknown }
  | {
      type: 'tool_result'
      toolCallId: string
      name: string
      preview: string
      result: string
    }
  | { type: 'error'; error: string }

export type AgentUsage = {
  inputTokens: number
  outputTokens: number
}

type RunAgentOptions = {
  openai: OpenAI
  messages: ClientMessage[]
  onEvent: (event: AgentEvent) => void | Promise<void>
  signal: AbortSignal
  logger?: pino.Logger
}

type ToolCallAccumulator = {
  id: string
  name: string
  arguments: string
}

// 导出 AI 智能体执行函数
export async function runAgent({
  openai, // OpenAI 客户端实例
  messages, // 用户传入的对话历史
  onEvent, // 事件回调：把文本/工具调用/结果传给前端
  signal, // 中断信号：用户取消请求时停止
  logger, // 可选：pino 结构化日志记录器
}: RunAgentOptions): Promise<AgentUsage> {
  // ====================== 1. 构建对话上下文 ======================
  // 拼接完整对话：系统提示词 + 用户历史消息
  const conversation: ChatCompletionMessageParam[] = [
    { role: 'system', content: getSystemPrompt() }, // 系统提示（Agent 行为规则）
    ...messages.map<ChatCompletionMessageParam>((m) =>
      // 把用户消息统一格式：只保留 user/assistant 角色
      m.role === 'user'
        ? { role: 'user', content: m.content }
        : { role: 'assistant', content: m.content },
    ),
  ]

  // ====================== 2. 工具调用循环（最多执行 MAX_ITERATIONS 轮） ======================
  // 限制最大迭代次数，防止无限调用工具
  let totalInputTokens = 0
  let totalOutputTokens = 0

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (signal.aborted) return { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }

    // 变量初始化：缓存本轮 AI 返回的文本、工具调用、结束原因
    let textBuffer = ''
    const toolCalls = new Map<number, ToolCallAccumulator>()
    let finishReason: string | null = null

    // ====================== 3. 调用 AI 流式接口 ======================
    // stream: true → 开启流式输出
    // 用 try/catch 包裹：AbortSignal 触发时 OpenAI SDK 底层 fetch 会抛出错误，需静默退出
    try {
      const stream = await openai.chat.completions.create(
        {
          model: MODEL,
          stream: true,
          stream_options: { include_usage: true },
          messages: conversation, // 把完整对话传给 AI
          tools: getOpenAITools(), // 注册可用工具（搜索、计算器等）
          tool_choice: 'auto', // 自动判断是否需要调用工具
          // 兼容 DeepSeek 模型：关闭思考过程，让前端更快收到内容
          ...({ thinking: { type: 'disabled' } } as Record<string, unknown>),
        },
        { signal }, // 将 AbortSignal 传入 OpenAI SDK，客户端断开时终止请求
      )

      // ====================== 4. 解析流式返回（你上一轮问的核心代码） ======================
      for await (const chunk of stream) {
        if (signal.aborted)
          return { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }

        const choice = chunk.choices[0]
        if (!choice) continue
        const delta = choice.delta

        // 4.1 处理流式文本：实时输出
        if (delta?.content) {
          textBuffer += delta.content
          await onEvent({ type: 'text', text: delta.content })
        }

        // 4.2 处理工具调用：增量拼接工具参数（流式分片）
        if (delta?.tool_calls) {
          for (const part of delta.tool_calls) {
            const index = part.index
            const existing = toolCalls.get(index) ?? {
              id: '',
              name: '',
              arguments: '',
            }
            if (part.id) existing.id = part.id
            if (part.function?.name) existing.name = part.function.name
            if (part.function?.arguments) existing.arguments += part.function.arguments
            toolCalls.set(index, existing)
          }
        }

        // 记录结束原因：stop / tool_calls / length
        if (choice.finish_reason) finishReason = choice.finish_reason

        // 收集 token 用量（仅在 stream_options.include_usage 开启时返回）
        if (chunk.usage) {
          totalInputTokens += chunk.usage.prompt_tokens ?? 0
          totalOutputTokens += chunk.usage.completion_tokens ?? 0
        }
      }
    } catch (error) {
      // 客户端主动断开连接导致的 AbortError → 静默退出，不向上抛
      if (signal.aborted) return { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
      throw error
    }

    // ====================== 5. 判断是否结束：不需要工具 → 直接返回 ======================
    if (finishReason !== 'tool_calls' || toolCalls.size === 0) {
      return { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
    }

    // ====================== 6. 工具调用排序与格式化 ======================
    // 把 Map 转成数组，并按 index 排序（保证工具调用顺序正确）
    const orderedCalls = [...toolCalls.entries()]
      .toSorted(([a]: [number, unknown], [b]: [number, unknown]) => a - b)
      .map(([, value]: [number, ToolCallAccumulator]) => value)

    // 格式化为 OpenAI 标准的 tool_calls 结构
    const assistantToolCalls: ChatCompletionMessageToolCall[] = orderedCalls.map(
      (call: ToolCallAccumulator) => ({
        id: call.id,
        type: 'function',
        function: {
          name: call.name,
          arguments: call.arguments || '{}',
        },
      }),
    )

    // ====================== 7. 把【AI 的工具调用】加入对话历史 ======================
    conversation.push({
      role: 'assistant',
      content: textBuffer || null, // AI 说的话
      tool_calls: assistantToolCalls, // AI 要调用的工具
    })

    // ====================== 8. 依次执行所有工具调用 ======================
    for (const call of orderedCalls) {
      if (signal.aborted) return { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }

      let parsedArgs: Record<string, unknown> = {}
      try {
        parsedArgs = call.arguments ? JSON.parse(call.arguments) : {}
      } catch (error) {
        // 参数解析失败：把错误信息加入对话
        const message = `工具参数解析失败：${(error as Error).message}`
        conversation.push({
          role: 'tool',
          tool_call_id: call.id,
          content: message,
        })
        await onEvent({
          type: 'tool_result',
          toolCallId: call.id,
          name: call.name,
          preview: message.slice(0, 120),
          result: message,
        })
        continue
      }

      // 通知前端：开始调用工具
      await onEvent({
        type: 'tool_call',
        toolCallId: call.id,
        name: call.name,
        args: parsedArgs,
      })

      // ====================== 9. 执行具体工具（搜索/计算/查询） ======================
      const resultText = await runTool(call.name, parsedArgs, logger)

      // ====================== 10. 把【工具执行结果】加入对话历史 ======================
      conversation.push({
        role: 'tool',
        tool_call_id: call.id, // 对应工具调用 ID
        content: resultText, // 工具返回结果
      })

      // 通知前端：工具执行完成
      await onEvent({
        type: 'tool_result',
        toolCallId: call.id,
        name: call.name,
        preview: resultText.slice(0, 120), // 预览前120个字符
        result: resultText,
      })
    }

    // ====================== 一轮工具调用结束 → 回到循环顶部，让 AI 根据结果继续回答 ======================
  }

  // ====================== 超出最大迭代次数：报错 ======================
  const maxIterMsg = `Agent 工具迭代次数超过上限（${MAX_ITERATIONS}）`
  logger?.error({ maxIterations: MAX_ITERATIONS }, maxIterMsg)
  await onEvent({
    type: 'error',
    error: maxIterMsg,
  })

  return { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
}

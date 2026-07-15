import type pino from 'pino'

import { getSystemPrompt } from '../prompts/system.js'
import { buildAgentConversation } from '../runtime/context-builder.js'
import type { ModelClient, ModelMessage } from '../runtime/model-client/types.js'
import { parseModelStream } from '../runtime/stream-parser.js'
import type { AgentEvent, AgentUsage } from '../runtime/types.js'
import type { ClientMessage } from '../types/chat.js'
import { runAgent } from './agent.js'

export const MULTI_AGENT_STAGE_ROLES = ['planner', 'executor', 'critic'] as const

export type MultiAgentStageRole = (typeof MULTI_AGENT_STAGE_ROLES)[number]
export type MultiAgentStageStatus = 'running' | 'completed' | 'failed' | 'canceled'

export type MultiAgentStageEvent = {
  role: MultiAgentStageRole
  sequence: number
  status: MultiAgentStageStatus
  output?: string
  error?: string
  usage?: AgentUsage
}

type StageResult = {
  output: string
  usage: AgentUsage
}

type RunExecutor = typeof runAgent

type RunMultiAgentWorkflowOptions = {
  modelClient: ModelClient
  messages: ClientMessage[]
  onEvent: (event: AgentEvent) => void | Promise<void>
  onStageEvent: (event: MultiAgentStageEvent) => void | Promise<void>
  signal: AbortSignal
  logger?: pino.Logger
  runExecutor?: RunExecutor
}

const PLANNER_PROMPT = [
  '你是 Planner，负责把用户的软件工程任务拆成可执行计划。',
  '只分析目标、约束、风险和步骤，不调用工具，也不直接给出最终答案。',
  '输出简洁的纯文本计划，明确 Executor 应验证的事实和 Critic 应检查的风险。',
].join('\n')

function getExecutorPrompt(plan: string) {
  return [
    getSystemPrompt(),
    '',
    '多 Agent 工作流角色：你是 Executor。',
    '根据 Planner 的计划完成任务；可以使用已注册工具验证事实。',
    '产出一份完整候选答案，供 Critic 审查。',
    '',
    'Planner 计划：',
    plan,
  ].join('\n')
}

function getCriticPrompt(plan: string) {
  return [
    getSystemPrompt(),
    '',
    '多 Agent 工作流角色：你是 Critic。',
    '审查 Executor 草稿的正确性、完整性、证据边界、安全性和可执行性。',
    '修正发现的问题，并只输出可以直接交付给用户的最终答案；不要描述审查过程。',
    '你不能调用工具，也不要声称验证了草稿中没有证据支持的事实。',
    '',
    'Planner 计划：',
    plan,
  ].join('\n')
}

function abortError(signal: AbortSignal) {
  return signal.reason instanceof Error ? signal.reason : new Error('Multi-agent workflow aborted.')
}

async function runTextStage({
  messages,
  modelClient,
  onText,
  signal,
}: {
  messages: ModelMessage[]
  modelClient: ModelClient
  onText?: (text: string) => void | Promise<void>
  signal: AbortSignal
}): Promise<StageResult> {
  const stream = await modelClient.streamChat({
    messages,
    tools: [],
    signal,
  })
  const result = await parseModelStream({
    stream,
    signal,
    onEvent: async (event) => {
      if (event.type === 'text') await onText?.(event.text)
    },
  })

  if (result.aborted || signal.aborted) throw abortError(signal)
  if (result.toolCalls.size > 0) {
    throw new Error('A text-only workflow stage attempted to call a tool.')
  }
  if (!result.text.trim()) {
    throw new Error('A workflow stage returned an empty response.')
  }

  return {
    output: result.text,
    usage: result.usage,
  }
}

export async function runMultiAgentWorkflow({
  modelClient,
  messages,
  onEvent,
  onStageEvent,
  signal,
  logger,
  runExecutor = runAgent,
}: RunMultiAgentWorkflowOptions): Promise<AgentUsage> {
  const totalUsage: AgentUsage = { inputTokens: 0, outputTokens: 0 }

  const runStage = async (
    role: MultiAgentStageRole,
    sequence: number,
    execute: () => Promise<StageResult>,
  ) => {
    await onStageEvent({ role, sequence, status: 'running' })

    try {
      const result = await execute()
      totalUsage.inputTokens += result.usage.inputTokens
      totalUsage.outputTokens += result.usage.outputTokens
      await onStageEvent({
        role,
        sequence,
        status: 'completed',
        output: result.output,
        usage: result.usage,
      })
      return result
    } catch (error) {
      await onStageEvent({
        role,
        sequence,
        status: signal.aborted ? 'canceled' : 'failed',
        error: signal.aborted ? undefined : (error as Error).message,
      })
      throw error
    }
  }

  const planner = await runStage('planner', 0, () =>
    runTextStage({
      modelClient,
      messages: buildAgentConversation(messages, PLANNER_PROMPT),
      signal,
    }),
  )

  const executor = await runStage('executor', 1, async () => {
    let output = ''
    let executorError: string | undefined
    const usage = await runExecutor({
      modelClient,
      messages,
      signal,
      logger: logger?.child({ agentStage: 'executor' }),
      systemPrompt: getExecutorPrompt(planner.output),
      onEvent: async (event) => {
        if (event.type === 'text') {
          output += event.text
          return
        }
        if (event.type === 'error') {
          executorError = event.error
          return
        }
        await onEvent(event)
      },
    })

    if (signal.aborted) throw abortError(signal)
    if (executorError) throw new Error(executorError)
    if (!output.trim()) throw new Error('Executor returned an empty response.')

    return { output, usage }
  })

  await runStage('critic', 2, () =>
    runTextStage({
      modelClient,
      messages: [
        ...buildAgentConversation(messages, getCriticPrompt(planner.output)),
        { role: 'assistant', content: executor.output },
        {
          role: 'user',
          content: '请审查上面的候选答案并返回修正后的最终答案。',
        },
      ],
      signal,
      onText: (text) => onEvent({ type: 'text', text }),
    }),
  )

  return totalUsage
}

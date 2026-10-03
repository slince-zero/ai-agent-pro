import type { AgentStreamEvent, EvidenceSource } from '@ai-agent-pro/shared/type.js'
import type { AgentCase } from './dataset.js'
import { describeMatch, matches } from './score-intent.js'
import type { Check } from './score-intent.js'

/** 一次运行留下的、评测需要的全部东西。由事件流还原，不碰账本内部 */
export type Trajectory = {
  rounds: number
  toolCalls: { name: string; arguments: string }[]
  toolResults: { name: string; ok: boolean }[]
  /** 最后一轮的正文。前面几轮的"我先搜一下"不算答案 */
  answer: string
  evidence: EvidenceSource[]
  done: boolean
  inputTokens: number
  outputTokens: number
  error?: string
}

/**
 * 消费一次运行的事件流，还原出轨迹。
 *
 * 循环抛错时不往外抛，而是记进 error：评测要的是"这一条失败了、为什么"，
 * 不是让整个评测进程跟着停下。
 */
export async function collectTrajectory(
  events: AsyncIterable<AgentStreamEvent>,
): Promise<Trajectory> {
  const trajectory: Trajectory = {
    rounds: 0,
    toolCalls: [],
    toolResults: [],
    answer: '',
    evidence: [],
    done: false,
    inputTokens: 0,
    outputTokens: 0,
  }

  try {
    for await (const event of events) {
      switch (event.type) {
        case 'round_start':
          trajectory.rounds = event.round
          trajectory.answer = ''
          break
        case 'text_delta':
          trajectory.answer += event.delta
          break
        case 'tool_call':
          trajectory.toolCalls.push({ name: event.name, arguments: event.arguments })
          break
        case 'tool_result':
          trajectory.toolResults.push({ name: event.name, ok: event.ok })
          break
        case 'usage':
          trajectory.inputTokens += event.usage.inputTokens
          trajectory.outputTokens += event.usage.outputTokens
          break
        case 'evidence':
          trajectory.evidence = event.sources
          break
        case 'done':
          trajectory.done = true
          break
      }
    }
  } catch (error: unknown) {
    trajectory.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  }

  return trajectory
}

const CITATION_PATTERN = /\[([1-9]\d{0,2})\]/g

function readCitations(text: string) {
  return [...text.matchAll(CITATION_PATTERN)].map((match) => Number(match[1]))
}

/**
 * "已确认"这一行是不是条件核对里的一条结论，而不是一个小标题。
 *
 * 模型有时会写 `**已确认**` 再把条目列在下面；那一行本身没有结论，也就不该要求它带引用。
 */
function isConfirmedClaim(line: string) {
  if (!line.includes('已确认')) return false

  return line.replace(/[\s*#>\-:：|]/g, '').replace('已确认', '').length > 0
}

/**
 * 每次运行都要守住的约定，来自 agent.ts 里的 system prompt。
 *
 * 这几条和问题无关：不管问什么，引用都得指向真实来源，"已确认"都得有正文撑着。
 * 它们是这套评测里最硬的部分——不需要标准答案，规则本身就是答案。
 */
export function scoreInvariants(trajectory: Trajectory): Check[] {
  const refs = new Map(trajectory.evidence.map((source) => [source.ref, source]))
  const cited = readCitations(trajectory.answer)
  const dangling = cited.filter((ref) => !refs.has(ref))
  const unsupported = trajectory.answer
    .split('\n')
    .filter(isConfirmedClaim)
    .filter((line) => !readCitations(line).some((ref) => refs.get(ref)?.read === true))

  return [
    {
      name: '正常结束（done）',
      pass: trajectory.done && trajectory.error === undefined,
      ...(trajectory.error ? { actual: trajectory.error } : {}),
    },
    {
      name: '答案非空',
      pass: trajectory.answer.trim().length > 0,
    },
    {
      name: '引用编号都能对上来源',
      pass: dangling.length === 0,
      actual: { dangling: [...new Set(dangling)], refs: [...refs.keys()] },
    },
    {
      name: '没有裸链接',
      pass: !/https?:\/\//.test(trajectory.answer),
    },
    {
      name: '"已确认"都引用了读过正文的来源',
      pass: unsupported.length === 0,
      actual: unsupported,
    },
  ]
}

/** 这一条用例自己的期望 */
export function scoreAgentExpect(trajectory: Trajectory, expect: AgentCase['expect']): Check[] {
  const checks: Check[] = []
  const calls = trajectory.toolCalls.length

  if (expect.tools === 'none') {
    checks.push({ name: '没有调用工具', pass: calls === 0, actual: calls })
  }

  if (expect.tools === 'required') {
    checks.push({ name: '至少调用一次工具', pass: calls > 0, actual: calls })
  }

  if (expect.readPage) {
    const reads = trajectory.toolResults.filter(
      (result) => result.name === 'read_page' && result.ok,
    ).length

    checks.push({ name: '至少成功读回一页正文', pass: reads > 0, actual: reads })
  }

  if (expect.checklist) {
    checks.push({ name: '有"条件核对"一段', pass: trajectory.answer.includes('条件核对') })
  }

  for (const match of expect.answerHas ?? []) {
    checks.push({
      name: `答案包含 ${describeMatch(match)}`,
      pass: matches(trajectory.answer, match),
    })
  }

  for (const match of expect.answerLacks ?? []) {
    checks.push({
      name: `答案不含 ${describeMatch(match)}`,
      pass: !matches(trajectory.answer, match),
    })
  }

  return checks
}

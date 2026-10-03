/**
 * 评测入口：pnpm eval [suite...] [--repeat N] [--case id] [--concurrency N]
 *
 * 和 pnpm test 的区别：这里调的是真模型、真搜索，结果有随机性，所以不进 CI，
 * 也不按"过 / 不过"退出——它产出的是一份报告，用来和改动前的那一份比较。
 */
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { askAgentStream } from '../agent.js'
import { DEEPSEEK_MODEL } from '../deepseek-client.js'
import { resolveRetrievalTask } from '../retrieval/resolve-retrieval-task.js'
import {
  extractRetrievalIntent,
  updateRetrievalIntent,
} from '../retrieval/extract-retrieval-intent.js'
import { isSuiteName, loadSuite } from './dataset.js'
import type { AgentCase, IntentCase, IntentUpdateCase, SuiteName } from './dataset.js'
import { collectTrajectory, scoreAgentExpect, scoreInvariants } from './score-agent.js'
import { scoreIntent, scoreUnchanged } from './score-intent.js'
import type { Check } from './score-intent.js'

type CaseRun = {
  suite: SuiteName
  caseId: string
  attempt: number
  pass: boolean
  checks: Check[]
  durationMs: number
  /** 模型产出的东西：意图 JSON，或者答案和轨迹统计。失败时回头看它 */
  output?: unknown
}

/** 不带工具的一次模型请求，一分钟足够；Agent 一次运行最多 8 轮，每轮还可能等 12s 的读页 */
const CASE_TIMEOUT_MS = { intent: 60_000, 'intent-update': 60_000, agent: 300_000 }

/** 不点名时只跑便宜的两套：agent 每条都会真的搜索、读页，花的是 Tavily 额度 */
const DEFAULT_SUITES: SuiteName[] = ['intent', 'intent-update']

function print(line = '') {
  process.stdout.write(`${line}\n`)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

/** 解析本身也是一条检查：schema 校验不过、JSON 不合法，都是这一层最常见的失败 */
function parsedCheck(error?: unknown): Check {
  return error === undefined
    ? { name: '输出通过 schema 校验', pass: true }
    : { name: '输出通过 schema 校验', pass: false, actual: errorMessage(error) }
}

async function runIntentCase(item: IntentCase, signal: AbortSignal) {
  try {
    const intent = await extractRetrievalIntent(item.input, signal)

    return { checks: [parsedCheck(), ...scoreIntent(intent, item.expect)], output: intent }
  } catch (error: unknown) {
    return { checks: [parsedCheck(error)] }
  }
}

async function runIntentUpdateCase(item: IntentUpdateCase, signal: AbortSignal) {
  try {
    const intent = await updateRetrievalIntent(item.current, item.instruction, signal)

    return {
      checks: [
        parsedCheck(),
        ...scoreIntent(intent, item.expect),
        ...scoreUnchanged(item.current, intent, item.unchanged),
      ],
      output: intent,
    }
  } catch (error: unknown) {
    return { checks: [parsedCheck(error)] }
  }
}

/** 和 app.ts 里的组装方式保持一致：评的是用户真正用到的那条链路 */
async function runAgentCase(item: AgentCase, signal: AbortSignal) {
  const history = [...item.messages]
  const turns = [{ expect: item.expect }, ...(item.followUps ?? [])]
  const checks: Check[] = []
  const outputs: Record<string, unknown>[] = []
  for (const [index, turn] of turns.entries()) {
    if ('input' in turn) history.push({ role: 'user', content: turn.input })
    const trajectory = await collectTrajectory(
      askAgentStream(
        history,
        { signal },
        {
          resolveTask: (taskMessages, taskSignal) => resolveRetrievalTask(taskMessages, taskSignal),
        },
      ),
    )
    const count = (name: string) => trajectory.toolCalls.filter((call) => call.name === name).length
    checks.push(
      ...[...scoreInvariants(trajectory), ...scoreAgentExpect(trajectory, turn.expect)].map(
        (check) => ({
          ...check,
          name: turns.length > 1 ? `第 ${index + 1} 次提问：${check.name}` : check.name,
        }),
      ),
    )
    outputs.push({
      answer: trajectory.answer,
      rounds: trajectory.rounds,
      searches: count('search'),
      pageReads: count('read_page'),
      failedTools: trajectory.toolResults.filter((result) => !result.ok).length,
      sources: trajectory.evidence.length,
      inputTokens: trajectory.inputTokens,
      outputTokens: trajectory.outputTokens,
      toolCalls: trajectory.toolCalls,
      evidence: trajectory.evidence,
      task: trajectory.task,
      ...(trajectory.error ? { error: trajectory.error } : {}),
    })
    if (!trajectory.done || trajectory.error) break
    history.push({ role: 'assistant', content: trajectory.answer })
  }
  const totals = Object.fromEntries(
    [
      'rounds',
      'searches',
      'pageReads',
      'failedTools',
      'sources',
      'inputTokens',
      'outputTokens',
    ].map((key) => [key, outputs.reduce((sum, output) => sum + Number(output[key] ?? 0), 0)]),
  )
  return {
    checks,
    output: { ...outputs.at(-1), ...totals, ...(turns.length > 1 ? { turns: outputs } : {}) },
  }
}

async function runCase(
  suite: SuiteName,
  item: IntentCase | IntentUpdateCase | AgentCase,
  attempt: number,
): Promise<CaseRun> {
  const signal = AbortSignal.timeout(CASE_TIMEOUT_MS[suite])
  const startedAt = performance.now()
  const result =
    suite === 'intent'
      ? await runIntentCase(item as IntentCase, signal)
      : suite === 'intent-update'
        ? await runIntentUpdateCase(item as IntentUpdateCase, signal)
        : await runAgentCase(item as AgentCase, signal)

  return {
    suite,
    caseId: item.id,
    attempt,
    pass: result.checks.every((check) => check.pass),
    checks: result.checks,
    durationMs: Math.round(performance.now() - startedAt),
    ...('output' in result ? { output: result.output } : {}),
  }
}

/** 最多同时跑 limit 个，结果按任务原顺序返回 */
async function runPool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = Array.from({ length: tasks.length })
  let next = 0

  async function worker() {
    while (next < tasks.length) {
      const index = next++
      results[index] = await tasks[index]!()
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))

  return results
}

function readGitRevision() {
  try {
    const revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' })
    const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()

    return `${revision.trim()}${dirty ? '-dirty' : ''}`
  } catch {
    return 'unknown'
  }
}

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

function printSuiteSummary(suite: SuiteName, runs: CaseRun[]) {
  const byCase = new Map<string, CaseRun[]>()

  for (const run of runs) byCase.set(run.caseId, [...(byCase.get(run.caseId) ?? []), run])

  const checks = runs.flatMap((run) => run.checks)
  const passedCases = [...byCase.values()].filter((caseRuns) => caseRuns.every((run) => run.pass))
  const checkRate = (checks.filter((check) => check.pass).length / checks.length) * 100

  print()
  print(
    `■ ${suite}  ${passedCases.length}/${byCase.size} 条用例全部通过 · 检查通过率 ${checkRate.toFixed(1)}%`,
  )

  for (const [caseId, caseRuns] of byCase) {
    const passed = caseRuns.filter((run) => run.pass).length

    if (passed === caseRuns.length) continue

    const failed = new Set(
      caseRuns.flatMap((run) => run.checks.filter((check) => !check.pass).map((c) => c.name)),
    )

    print(`  ✗ ${caseId}  ${passed}/${caseRuns.length}`)
    for (const name of failed) print(`      - ${name}`)
  }

  if (suite === 'agent') {
    const outputs = runs.map((run) => run.output as Record<string, number>)
    const pick = (key: string) => average(outputs.map((output) => output[key] ?? 0)).toFixed(1)

    print(
      `  平均：${pick('rounds')} 轮 · ${pick('searches')} 次 search · ${pick('pageReads')} 次 read_page · ` +
        `${pick('inputTokens')} 输入 token · ${(average(runs.map((run) => run.durationMs)) / 1000).toFixed(1)}s`,
    )
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      repeat: { type: 'string', short: 'r', default: '1' },
      case: { type: 'string', short: 'c', multiple: true },
      concurrency: { type: 'string' },
    },
  })
  const requested = positionals.filter((value) => value !== '--')
  const unknown = requested.filter((name) => !isSuiteName(name))

  if (unknown.length > 0) throw new Error(`Unknown suite: ${unknown.join(', ')}`)

  const selected = requested.length > 0 ? (requested as SuiteName[]) : DEFAULT_SUITES
  const repeat = Number(values.repeat)

  if (!Number.isInteger(repeat) || repeat < 1)
    throw new Error('--repeat must be a positive integer')
  if (!process.env.OPENAI_API_KEY)
    throw new Error('OPENAI_API_KEY is not set (packages/server/.env)')
  // 不直接退出：不带工具的那几条用例（--case chitchat-no-tools）没有它也能跑
  if (selected.includes('agent') && !process.env.TAVILY_API_KEY) {
    print(
      '⚠ TAVILY_API_KEY 没有配置：agent 用例里的每次工具调用都会失败，结果只对不联网的用例有意义',
    )
  }

  const startedAt = new Date()
  const runs: CaseRun[] = []

  print(`model ${DEEPSEEK_MODEL} · revision ${readGitRevision()} · repeat ${repeat}`)

  for (const suite of selected) {
    const cases = (await loadSuite(suite)).filter(
      (item) => !values.case || values.case.includes(item.id),
    )
    const concurrency = Number(values.concurrency ?? (suite === 'agent' ? 2 : 4))
    const tasks = cases.flatMap((item) =>
      Array.from({ length: repeat }, (_, attempt) => async () => {
        const run = await runCase(suite, item, attempt + 1)

        print(
          `  ${run.pass ? '✓' : '✗'} ${suite}/${run.caseId}#${run.attempt}  ${run.durationMs}ms`,
        )
        return run
      }),
    )

    if (tasks.length === 0) continue

    runs.push(...(await runPool(tasks, concurrency)))
  }

  for (const suite of selected) {
    const suiteRuns = runs.filter((run) => run.suite === suite)
    if (suiteRuns.length > 0) printSuiteSummary(suite, suiteRuns)
  }

  const directory = new URL('../../eval-reports/', import.meta.url)
  const file = new URL(
    `${startedAt.toISOString().replace(/[:.]/g, '-')}-${selected.join('+')}.json`,
    directory,
  )

  await mkdir(directory, { recursive: true })
  await writeFile(
    file,
    `${JSON.stringify(
      {
        model: DEEPSEEK_MODEL,
        revision: readGitRevision(),
        startedAt: startedAt.toISOString(),
        repeat,
        runs,
      },
      null,
      2,
    )}\n`,
  )

  print()
  print(`报告：${file.pathname}`)
}

main().catch((error: unknown) => {
  process.stderr.write(`${errorMessage(error)}\n`)
  process.exitCode = 1
})

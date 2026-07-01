import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { AgentEvent } from '../services/agent.js'

export type EvalExpected = {
  excludes?: string[]
  includes?: string[]
  toolCalls?: string[]
}

export type EvalCase = {
  id: string
  suite: string
  input: string
  expected: EvalExpected
  mock?: {
    output: string
    toolCalls?: string[]
  }
  rubric?: string
  tags?: string[]
}

export type EvalRunOutput = {
  output: string
  toolCalls?: string[]
  usage?: {
    inputTokens?: number
    outputTokens?: number
  }
}

export type EvalProvider = {
  name: string
  runCase: (testCase: EvalCase, signal: AbortSignal) => Promise<EvalRunOutput>
}

export type EvalCaseResult = {
  id: string
  input: string
  output: string
  passed: boolean
  reasons: string[]
  score: number
  suite: string
  tags: string[]
  toolCalls: string[]
  usage: {
    inputTokens: number
    outputTokens: number
  }
}

export type EvalRunReport = {
  commit: string
  durationMs: number
  failed: number
  generatedAt: string
  passRate: number
  passed: number
  provider: string
  results: EvalCaseResult[]
  suite: string
  total: number
  totalInputTokens: number
  totalOutputTokens: number
}

export type RunEvalSuiteInput = {
  cases: EvalCase[]
  commit?: string
  now?: () => Date
  provider: EvalProvider
  signal?: AbortSignal
  suite: string
}

function assertString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Eval case ${field} is required`)
  }
  return value.trim()
}

function assertStringArray(value: unknown, field: string) {
  if (value == null) return []
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Eval case ${field} must be a string array`)
  }
  return value.map((item) => item.trim()).filter(Boolean)
}

function parseEvalCase(raw: unknown): EvalCase {
  const value = raw as Record<string, unknown>
  const expected = (value.expected ?? {}) as Record<string, unknown>
  const mock = value.mock as Record<string, unknown> | undefined

  return {
    id: assertString(value.id, 'id'),
    suite: assertString(value.suite, 'suite'),
    input: assertString(value.input, 'input'),
    expected: {
      includes: assertStringArray(expected.includes, 'expected.includes'),
      excludes: assertStringArray(expected.excludes, 'expected.excludes'),
      toolCalls: assertStringArray(expected.toolCalls, 'expected.toolCalls'),
    },
    ...(mock
      ? {
          mock: {
            output: assertString(mock.output, 'mock.output'),
            toolCalls: assertStringArray(mock.toolCalls, 'mock.toolCalls'),
          },
        }
      : {}),
    ...(typeof value.rubric === 'string' && value.rubric.trim()
      ? { rubric: value.rubric.trim() }
      : {}),
    tags: assertStringArray(value.tags, 'tags'),
  }
}

export async function loadEvalCases(filePath: string, suite: string) {
  const raw = await readFile(filePath, 'utf8')
  const cases = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => parseEvalCase(JSON.parse(line)))
    .filter((testCase) => testCase.suite === suite)

  if (cases.length === 0) {
    throw new Error(`No eval cases found for suite "${suite}" in ${filePath}`)
  }

  return cases
}

export function createMockEvalProvider(): EvalProvider {
  return {
    name: 'mock',
    async runCase(testCase) {
      return {
        output: testCase.mock?.output ?? '',
        toolCalls: testCase.mock?.toolCalls ?? [],
        usage: {
          inputTokens: 0,
          outputTokens: 0,
        },
      }
    },
  }
}

export function scoreRuleBased(testCase: EvalCase, runOutput: EvalRunOutput) {
  const reasons: string[] = []
  const output = runOutput.output.toLowerCase()
  const toolCalls = new Set(runOutput.toolCalls ?? [])

  for (const expectedText of testCase.expected.includes ?? []) {
    if (!output.includes(expectedText.toLowerCase())) {
      reasons.push(`missing expected text: ${expectedText}`)
    }
  }

  for (const excludedText of testCase.expected.excludes ?? []) {
    if (output.includes(excludedText.toLowerCase())) {
      reasons.push(`contains excluded text: ${excludedText}`)
    }
  }

  for (const toolName of testCase.expected.toolCalls ?? []) {
    if (!toolCalls.has(toolName)) {
      reasons.push(`missing expected tool call: ${toolName}`)
    }
  }

  return {
    passed: reasons.length === 0,
    reasons,
    score: reasons.length === 0 ? 1 : 0,
  }
}

export async function runEvalSuite({
  cases,
  commit = 'unknown',
  now = () => new Date(),
  provider,
  signal = new AbortController().signal,
  suite,
}: RunEvalSuiteInput): Promise<EvalRunReport> {
  const startedAt = Date.now()
  const results: EvalCaseResult[] = []

  for (const testCase of cases) {
    const output = await provider.runCase(testCase, signal)
    const score = scoreRuleBased(testCase, output)
    results.push({
      id: testCase.id,
      suite: testCase.suite,
      input: testCase.input,
      output: output.output,
      passed: score.passed,
      score: score.score,
      reasons: score.reasons,
      tags: testCase.tags ?? [],
      toolCalls: output.toolCalls ?? [],
      usage: {
        inputTokens: output.usage?.inputTokens ?? 0,
        outputTokens: output.usage?.outputTokens ?? 0,
      },
    })
  }

  const passed = results.filter((result) => result.passed).length
  const total = results.length

  return {
    suite,
    provider: provider.name,
    commit,
    generatedAt: now().toISOString(),
    durationMs: Date.now() - startedAt,
    total,
    passed,
    failed: total - passed,
    passRate: total === 0 ? 0 : passed / total,
    totalInputTokens: results.reduce((sum, result) => sum + result.usage.inputTokens, 0),
    totalOutputTokens: results.reduce((sum, result) => sum + result.usage.outputTokens, 0),
    results,
  }
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatReasons(reasons: string[]) {
  return reasons.length > 0 ? reasons.join('; ') : '-'
}

function formatTags(tags: string[]) {
  return tags.length > 0 ? tags.join(', ') : '-'
}

export function formatEvalMarkdownReport(report: EvalRunReport) {
  const lines = [
    `# Eval Report: ${report.suite}`,
    '',
    `- Provider: ${report.provider}`,
    `- Commit: ${report.commit}`,
    `- Generated at: ${report.generatedAt}`,
    `- Duration: ${report.durationMs}ms`,
    `- Pass rate: ${formatPercent(report.passRate)} (${report.passed}/${report.total})`,
    `- Tokens: ${report.totalInputTokens} input / ${report.totalOutputTokens} output`,
    '',
    '## Cases',
    '',
    '| Case | Result | Score | Tags | Failure reasons |',
    '|---|---:|---:|---|---|',
    ...report.results.map(
      (result) =>
        `| ${result.id} | ${result.passed ? 'pass' : 'fail'} | ${result.score.toFixed(
          2,
        )} | ${formatTags(result.tags)} | ${formatReasons(result.reasons)} |`,
    ),
  ]

  const failures = report.results.filter((result) => !result.passed)
  if (failures.length > 0) {
    lines.push('', '## Failures', '')
    for (const failure of failures) {
      lines.push(`### ${failure.id}`, '')
      lines.push(`Input: ${failure.input}`, '')
      lines.push(`Reasons: ${formatReasons(failure.reasons)}`, '')
      lines.push('Output:', '')
      lines.push('```text', failure.output, '```', '')
    }
  }

  return `${lines.join('\n')}\n`
}

export async function writeEvalReports({
  jsonPath,
  markdownPath,
  report,
}: {
  jsonPath?: string
  markdownPath?: string
  report: EvalRunReport
}) {
  if (markdownPath) {
    await mkdir(path.dirname(markdownPath), { recursive: true })
    await writeFile(markdownPath, formatEvalMarkdownReport(report))
  }

  if (jsonPath) {
    await mkdir(path.dirname(jsonPath), { recursive: true })
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  }
}

export async function createLiveAgentEvalProvider(): Promise<EvalProvider> {
  const [{ createDefaultModelClient }, { runAgent }] = await Promise.all([
    import('../services/openai.js'),
    import('../services/agent.js'),
  ])
  const modelClient = createDefaultModelClient()

  return {
    name: 'live',
    async runCase(testCase, signal) {
      let output = ''
      const toolCalls: string[] = []
      const usage = await runAgent({
        modelClient,
        messages: [{ role: 'user', content: testCase.input }],
        signal,
        onEvent: (event: AgentEvent) => {
          if (event.type === 'text') output += event.text
          if (event.type === 'tool_call') toolCalls.push(event.name)
        },
      })

      return {
        output,
        toolCalls,
        usage,
      }
    },
  }
}

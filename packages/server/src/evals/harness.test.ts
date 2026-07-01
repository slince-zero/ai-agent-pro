import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const {
  createMockEvalProvider,
  formatEvalMarkdownReport,
  loadEvalCases,
  runEvalSuite,
  scoreRuleBased,
  writeEvalReports,
} = await import('./harness.js')

test('loads JSONL eval cases by suite', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-cases-'))
  const filePath = path.join(dir, 'cases.jsonl')
  await writeFile(
    filePath,
    [
      JSON.stringify({
        id: 'case_1',
        suite: 'smoke',
        input: 'How should GitHub metadata be fetched?',
        expected: { includes: ['github_repository_lookup'] },
        mock: { output: 'Use github_repository_lookup.' },
      }),
      JSON.stringify({
        id: 'case_2',
        suite: 'other',
        input: 'Ignore',
        expected: { includes: ['ignore'] },
        mock: { output: 'ignore' },
      }),
    ].join('\n'),
  )

  const cases = await loadEvalCases(filePath, 'smoke')

  assert.equal(cases.length, 1)
  assert.equal(cases[0]?.id, 'case_1')
  await rm(dir, { recursive: true, force: true })
})

test('scores includes, excludes and expected tool calls', () => {
  const score = scoreRuleBased(
    {
      id: 'tool_case',
      suite: 'smoke',
      input: 'Fetch repo metadata',
      tags: ['tools'],
      expected: {
        includes: ['github_repository_lookup'],
        excludes: ['web_fetch is preferred'],
        toolCalls: ['github_repository_lookup'],
      },
    },
    {
      output: 'Call github_repository_lookup for repository metadata.',
      toolCalls: ['github_repository_lookup'],
    },
  )

  assert.deepEqual(score, { passed: true, reasons: [], score: 1 })
})

test('runs eval suite and formats reports', async () => {
  const report = await runEvalSuite({
    suite: 'smoke',
    commit: 'abc123',
    now: () => new Date('2026-07-01T08:00:00.000Z'),
    provider: createMockEvalProvider(),
    cases: [
      {
        id: 'passing_case',
        suite: 'smoke',
        input: 'What package manager?',
        tags: ['repo'],
        expected: { includes: ['pnpm'] },
        mock: { output: 'Use pnpm.' },
      },
      {
        id: 'failing_case',
        suite: 'smoke',
        input: 'What runner?',
        expected: { includes: ['node:test'] },
        mock: { output: 'Use vitest.' },
      },
    ],
  })

  assert.equal(report.total, 2)
  assert.equal(report.passed, 1)
  assert.equal(report.failed, 1)
  assert.equal(report.passRate, 0.5)

  const markdown = formatEvalMarkdownReport(report)
  assert.match(markdown, /Pass rate: 50% \(1\/2\)/)
  assert.match(markdown, /missing expected text: node:test/)

  const dir = await mkdtemp(path.join(tmpdir(), 'eval-report-'))
  const markdownPath = path.join(dir, 'report.md')
  const jsonPath = path.join(dir, 'report.json')
  await writeEvalReports({ report, markdownPath, jsonPath })

  assert.match(await readFile(markdownPath, 'utf8'), /Eval Report: smoke/)
  assert.equal(JSON.parse(await readFile(jsonPath, 'utf8')).failed, 1)
  await rm(dir, { recursive: true, force: true })
})

import { existsSync, readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import {
  createLiveAgentEvalProvider,
  createMockEvalProvider,
  loadEvalCases,
  runEvalSuite,
  writeEvalReports,
} from './harness.js'

type CliOptions = {
  cases?: string
  commit: string
  json?: string
  provider: 'live' | 'mock'
  report?: string
  suite: string
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    suite: 'smoke',
    provider: 'mock',
    commit: process.env.GITHUB_SHA ?? 'HEAD',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === '--') {
      continue
    } else if (arg === '--suite' && next) {
      options.suite = next
      index += 1
    } else if (arg === '--provider' && (next === 'mock' || next === 'live')) {
      options.provider = next
      index += 1
    } else if (arg === '--cases' && next) {
      options.cases = next
      index += 1
    } else if (arg === '--report' && next) {
      options.report = next
      index += 1
    } else if (arg === '--json' && next) {
      options.json = next
      index += 1
    } else if (arg === '--commit' && next) {
      options.commit = next
      index += 1
    } else if (arg === '--help') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown or incomplete eval option: ${arg}`)
    }
  }

  return options
}

function writeStdout(message: string) {
  process.stdout.write(`${message}\n`)
}

function writeStderr(message: string) {
  process.stderr.write(`${message}\n`)
}

function printHelp() {
  writeStdout(`Usage: pnpm eval -- [options]

Options:
  --suite <name>       Eval suite name. Default: smoke
  --provider <name>    mock or live. Default: mock
  --cases <path>       JSONL case file. Default: evals/suites/<suite>.jsonl
  --report <path>      Markdown report output path
  --json <path>        JSON report output path
  --commit <sha>       Commit label for the report. Default: GITHUB_SHA or HEAD
`)
}

function isWorkspaceRoot(candidate: string) {
  if (!existsSync(path.join(candidate, 'pnpm-workspace.yaml'))) {
    return false
  }

  try {
    const packageJson = JSON.parse(readFileSync(path.join(candidate, 'package.json'), 'utf8')) as {
      name?: unknown
    }
    return packageJson.name === 'ai-agent-pro'
  } catch {
    return false
  }
}

function findWorkspaceRoot(startDir: string) {
  let current = startDir
  while (current !== path.dirname(current)) {
    if (isWorkspaceRoot(current)) {
      return current
    }
    current = path.dirname(current)
  }
  return startDir
}

function resolveFromRoot(root: string, filePath: string | undefined, fallback: string) {
  const resolvedPath = filePath ?? fallback
  return path.isAbsolute(resolvedPath) ? resolvedPath : path.resolve(root, resolvedPath)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const workspaceRoot = findWorkspaceRoot(process.cwd())
  const casesPath = resolveFromRoot(
    workspaceRoot,
    options.cases,
    `evals/suites/${options.suite}.jsonl`,
  )
  const reportPath = resolveFromRoot(
    workspaceRoot,
    options.report,
    `evals/reports/${options.suite}.md`,
  )
  const jsonPath = resolveFromRoot(
    workspaceRoot,
    options.json,
    `evals/reports/${options.suite}.json`,
  )
  await mkdir(path.dirname(reportPath), { recursive: true })

  const cases = await loadEvalCases(casesPath, options.suite)
  const provider =
    options.provider === 'live' ? await createLiveAgentEvalProvider() : createMockEvalProvider()
  const report = await runEvalSuite({
    cases,
    suite: options.suite,
    provider,
    commit: options.commit,
  })
  await writeEvalReports({ report, markdownPath: reportPath, jsonPath })

  writeStdout(
    `Eval ${report.suite}: ${report.passed}/${report.total} passed (${Math.round(
      report.passRate * 100,
    )}%)`,
  )
  writeStdout(`Report: ${reportPath}`)
  writeStdout(`JSON: ${jsonPath}`)

  if (report.failed > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  writeStderr((error as Error).message)
  process.exitCode = 1
})

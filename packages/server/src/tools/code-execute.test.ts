import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { CodeSandbox, SandboxExecutionRequest } from '../services/code-sandbox.js'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

const { createCodeExecuteTool } = await import('./code-execute.js')

test('executes validated code with schema defaults and serializes the result', async () => {
  const requests: SandboxExecutionRequest[] = []
  const sandbox: CodeSandbox = {
    async execute(request) {
      requests.push(request)
      return {
        status: 'completed',
        stdout: '42\n',
        stderr: '',
        exitCode: 0,
        signal: null,
        durationMs: 12,
        timedOut: false,
        outputTruncated: false,
      }
    },
  }
  const tool = createCodeExecuteTool(sandbox)
  const request = tool.schema.parse({
    language: 'javascript',
    code: 'console.log(6 * 7)',
  })

  const result = JSON.parse(await tool.run(request, { signal: new AbortController().signal })) as {
    stdout: string
  }

  assert.equal(result.stdout, '42\n')
  assert.deepEqual(requests, [
    {
      language: 'javascript',
      code: 'console.log(6 * 7)',
      timeoutMs: 5_000,
    },
  ])
  assert.deepEqual(tool.governance, {
    category: 'code',
    sideEffect: false,
    requiresAuth: false,
    timeoutMs: 12_000,
  })
})

test('rejects unsupported languages and oversized code before execution', () => {
  const sandbox: CodeSandbox = {
    async execute() {
      throw new Error('should not execute')
    },
  }
  const tool = createCodeExecuteTool(sandbox)

  assert.equal(tool.schema.safeParse({ language: 'ruby', code: 'puts 1' }).success, false)
  assert.equal(
    tool.schema.safeParse({ language: 'python', code: 'x'.repeat(20_001) }).success,
    false,
  )
})

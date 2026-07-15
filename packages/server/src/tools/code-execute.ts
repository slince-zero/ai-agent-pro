import { z } from 'zod'

import { env } from '../env.js'
import {
  CODE_SANDBOX_LIMITS,
  createDockerCodeSandbox,
  type CodeSandbox,
} from '../services/code-sandbox.js'
import { defineTool } from './types.js'

const codeExecuteSchema = z
  .object({
    language: z
      .enum(['javascript', 'python'])
      .describe('Execution runtime. Only javascript and python are available.'),
    code: z
      .string()
      .min(1)
      .max(CODE_SANDBOX_LIMITS.maxCodeChars)
      .refine((code) => Boolean(code.trim()), 'Code must not be empty.')
      .describe(
        'Self-contained source code. External packages and network access are unavailable.',
      ),
    timeoutMs: z
      .number()
      .int()
      .min(CODE_SANDBOX_LIMITS.minTimeoutMs)
      .max(CODE_SANDBOX_LIMITS.maxTimeoutMs)
      .default(CODE_SANDBOX_LIMITS.defaultTimeoutMs)
      .describe('Execution timeout in milliseconds.'),
  })
  .strict()

export function createCodeExecuteTool(sandbox: CodeSandbox) {
  return defineTool({
    name: 'code_execute',
    description:
      'Execute a small, self-contained JavaScript or Python snippet in an isolated Docker container. Use for calculations, parsing, or validating algorithms. The container has no network, no host files, no package installation, no persistent storage, and strict resource/output limits.',
    governance: {
      category: 'code',
      sideEffect: false,
      requiresAuth: false,
      timeoutMs: CODE_SANDBOX_LIMITS.maxTimeoutMs + 2_000,
    },
    schema: codeExecuteSchema,
    async run(request, { signal }) {
      const result = await sandbox.execute(request, { signal })
      return JSON.stringify(result, null, 2)
    },
  })
}

const dockerSandbox = createDockerCodeSandbox({
  dockerBinary: env.CODE_SANDBOX_DOCKER_BINARY,
  javascriptImage: env.CODE_SANDBOX_JAVASCRIPT_IMAGE,
  pythonImage: env.CODE_SANDBOX_PYTHON_IMAGE,
})

export const codeExecuteTool = createCodeExecuteTool(dockerSandbox)

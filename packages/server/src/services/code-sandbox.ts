import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'

export const CODE_SANDBOX_LIMITS = {
  defaultTimeoutMs: 5_000,
  maxCodeChars: 20_000,
  maxOutputBytes: 64 * 1024,
  maxTimeoutMs: 10_000,
  minTimeoutMs: 100,
} as const

export type SandboxLanguage = 'javascript' | 'python'

export type SandboxExecutionRequest = {
  code: string
  language: SandboxLanguage
  timeoutMs: number
}

export type SandboxExecutionStatus = 'completed' | 'failed' | 'timed_out' | 'output_limit'

export type SandboxExecutionResult = {
  status: SandboxExecutionStatus
  stdout: string
  stderr: string
  exitCode: number | null
  signal: NodeJS.Signals | null
  durationMs: number
  timedOut: boolean
  outputTruncated: boolean
}

export type CodeSandbox = {
  execute: (
    request: SandboxExecutionRequest,
    options?: { signal?: AbortSignal },
  ) => Promise<SandboxExecutionResult>
}

type SpawnProcess = (command: string, args: readonly string[]) => ChildProcessWithoutNullStreams

type DockerCodeSandboxOptions = {
  dockerBinary?: string
  javascriptImage: string
  pythonImage: string
  maxOutputBytes?: number
  createContainerName?: () => string
  spawnProcess?: SpawnProcess
  removeContainer?: (dockerBinary: string, containerName: string) => Promise<void>
}

type LanguageRuntime = {
  image: string
  command: string
}

type TerminationReason = 'aborted' | 'output_limit' | 'timeout'

function defaultSpawnProcess(command: string, args: readonly string[]) {
  return spawn(command, [...args], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
}

function defaultRemoveContainer(dockerBinary: string, containerName: string) {
  return new Promise<void>((resolve) => {
    let settled = false
    const child = spawn(dockerBinary, ['rm', '--force', containerName], {
      stdio: 'ignore',
      windowsHide: true,
    })
    const timeout = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // The cleanup process may already have exited.
      }
      finish()
    }, 1_000)
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve()
    }
    child.once('error', finish)
    child.once('close', finish)
  })
}

function getRuntime(
  language: SandboxLanguage,
  images: Pick<DockerCodeSandboxOptions, 'javascriptImage' | 'pythonImage'>,
): LanguageRuntime {
  switch (language) {
    case 'javascript':
      return {
        image: images.javascriptImage,
        command: 'cat > /tmp/main.mjs && exec node /tmp/main.mjs',
      }
    case 'python':
      return {
        image: images.pythonImage,
        command: 'cat > /tmp/main.py && exec python3 -I -B /tmp/main.py',
      }
  }
}

export function buildDockerRunArgs({
  command,
  containerName,
  image,
}: {
  command: string
  containerName: string
  image: string
}) {
  return [
    'run',
    '--rm',
    '--init',
    '--interactive',
    '--name',
    containerName,
    '--pull',
    'never',
    '--network',
    'none',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges=true',
    '--pids-limit',
    '64',
    '--memory',
    '128m',
    '--memory-swap',
    '128m',
    '--cpus',
    '0.5',
    '--ulimit',
    'nofile=64:64',
    '--user',
    '65534:65534',
    '--workdir',
    '/tmp',
    '--env',
    'HOME=/tmp',
    '--env',
    'TMPDIR=/tmp',
    '--entrypoint',
    '/bin/sh',
    image,
    '-c',
    command,
  ]
}

function getExecutionStatus(
  reason: TerminationReason | undefined,
  exitCode: number | null,
): SandboxExecutionStatus {
  if (reason === 'timeout') return 'timed_out'
  if (reason === 'output_limit') return 'output_limit'
  return exitCode === 0 ? 'completed' : 'failed'
}

function assertRequestWithinLimits(request: SandboxExecutionRequest) {
  if (request.language !== 'javascript' && request.language !== 'python') {
    throw new Error('Sandbox language must be javascript or python.')
  }
  if (!request.code.trim()) {
    throw new Error('Sandbox code must not be empty.')
  }
  if (request.code.length > CODE_SANDBOX_LIMITS.maxCodeChars) {
    throw new Error(`Sandbox code exceeds ${CODE_SANDBOX_LIMITS.maxCodeChars} characters.`)
  }
  if (
    !Number.isInteger(request.timeoutMs) ||
    request.timeoutMs < CODE_SANDBOX_LIMITS.minTimeoutMs ||
    request.timeoutMs > CODE_SANDBOX_LIMITS.maxTimeoutMs
  ) {
    throw new Error(
      `Sandbox timeout must be an integer between ${CODE_SANDBOX_LIMITS.minTimeoutMs} and ${CODE_SANDBOX_LIMITS.maxTimeoutMs}ms.`,
    )
  }
}

export function createDockerCodeSandbox(options: DockerCodeSandboxOptions): CodeSandbox {
  const dockerBinary = options.dockerBinary ?? 'docker'
  const maxOutputBytes = options.maxOutputBytes ?? CODE_SANDBOX_LIMITS.maxOutputBytes
  const createContainerName =
    options.createContainerName ?? (() => `ai-agent-sandbox-${randomUUID()}`)
  const spawnProcess = options.spawnProcess ?? defaultSpawnProcess
  const removeContainer = options.removeContainer ?? defaultRemoveContainer

  return {
    async execute(request, executionOptions = {}) {
      assertRequestWithinLimits(request)
      if (executionOptions.signal?.aborted) {
        throw new Error('Sandbox execution aborted before start.')
      }

      const startedAt = Date.now()
      const containerName = createContainerName()
      const runtime = getRuntime(request.language, options)
      const args = buildDockerRunArgs({
        command: runtime.command,
        containerName,
        image: runtime.image,
      })
      const child = spawnProcess(dockerBinary, args)

      return await new Promise<SandboxExecutionResult>((resolve, reject) => {
        const stdout: Buffer[] = []
        const stderr: Buffer[] = []
        let capturedBytes = 0
        let settled = false
        let terminationReason: TerminationReason | undefined
        let timeout: NodeJS.Timeout | undefined
        let fallback: NodeJS.Timeout | undefined
        let cleanupPromise: Promise<void> | undefined

        const onAbort = () => requestTermination('aborted')

        const finish = async (
          exitCode: number | null,
          signal: NodeJS.Signals | null,
          spawnError?: Error,
        ) => {
          if (settled) return
          settled = true
          if (timeout) clearTimeout(timeout)
          if (fallback) clearTimeout(fallback)
          executionOptions.signal?.removeEventListener('abort', onAbort)
          await cleanupPromise

          if (spawnError) {
            reject(
              new Error(`Docker sandbox failed to start: ${spawnError.message}`, {
                cause: spawnError,
              }),
            )
            return
          }
          if (terminationReason === 'aborted') {
            reject(new Error('Sandbox execution aborted.'))
            return
          }

          resolve({
            status: getExecutionStatus(terminationReason, exitCode),
            stdout: Buffer.concat(stdout).toString('utf8'),
            stderr: Buffer.concat(stderr).toString('utf8'),
            exitCode,
            signal,
            durationMs: Date.now() - startedAt,
            timedOut: terminationReason === 'timeout',
            outputTruncated: terminationReason === 'output_limit',
          })
        }

        function requestTermination(reason: TerminationReason) {
          if (terminationReason || settled) return
          terminationReason = reason
          try {
            child.kill('SIGKILL')
          } catch {
            // Docker cleanup is still attempted by container name.
          }
          cleanupPromise = removeContainer(dockerBinary, containerName).catch(() => undefined)
          void cleanupPromise.finally(() => {
            if (!settled) {
              fallback = setTimeout(() => void finish(null, 'SIGKILL'), 250)
            }
          })
        }

        function capture(target: Buffer[], chunk: Buffer | string) {
          if (settled) return
          const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          const remaining = Math.max(0, maxOutputBytes - capturedBytes)
          if (remaining > 0) {
            target.push(value.subarray(0, remaining))
            capturedBytes += Math.min(value.length, remaining)
          }
          if (value.length > remaining) {
            requestTermination('output_limit')
          }
        }

        child.stdout.on('data', (chunk: Buffer | string) => capture(stdout, chunk))
        child.stderr.on('data', (chunk: Buffer | string) => capture(stderr, chunk))
        child.stdin.on('error', () => undefined)
        child.once('error', (error) => void finish(null, null, error))
        child.once('close', (exitCode, signal) => void finish(exitCode, signal))

        executionOptions.signal?.addEventListener('abort', onAbort, { once: true })
        timeout = setTimeout(() => requestTermination('timeout'), request.timeoutMs)
        child.stdin.end(request.code)
      })
    },
  }
}

import assert from 'node:assert/strict'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'

import { buildDockerRunArgs, createDockerCodeSandbox } from './code-sandbox.js'

class FakeChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  killedWith: NodeJS.Signals | undefined

  kill(signal: NodeJS.Signals = 'SIGTERM') {
    this.killedWith = signal
    queueMicrotask(() => this.emit('close', null, signal))
    return true
  }

  asChildProcess() {
    return this as unknown as ChildProcessWithoutNullStreams
  }
}

const images = {
  javascriptImage: 'node:test',
  pythonImage: 'python:test',
}

test('builds a Docker command with fixed isolation and resource limits', () => {
  const args = buildDockerRunArgs({
    command: 'fixed command',
    containerName: 'sandbox-test',
    image: 'node:test',
  })

  assert.deepEqual(args.slice(-3), ['node:test', '-c', 'fixed command'])
  assert.equal(args[args.indexOf('--network') + 1], 'none')
  assert.equal(args[args.indexOf('--pull') + 1], 'never')
  assert.equal(args[args.indexOf('--pids-limit') + 1], '64')
  assert.equal(args[args.indexOf('--memory') + 1], '128m')
  assert.equal(args[args.indexOf('--memory-swap') + 1], '128m')
  assert.equal(args[args.indexOf('--cpus') + 1], '0.5')
  assert.equal(args[args.indexOf('--user') + 1], '65534:65534')
  assert.equal(args.includes('--init'), true)
  assert.equal(args.includes('--read-only'), true)
  assert.equal(args.includes('ALL'), true)
  assert.equal(args.includes('no-new-privileges=true'), true)
  assert.equal(
    args.some((value) => value === '--volume' || value === '--mount'),
    false,
  )
})

test('passes code through stdin and captures container output', async () => {
  const child = new FakeChildProcess()
  let command = ''
  let args: readonly string[] = []
  let input = ''
  child.stdin.on('data', (chunk) => {
    input += chunk.toString()
  })

  const sandbox = createDockerCodeSandbox({
    ...images,
    dockerBinary: 'docker-test',
    createContainerName: () => 'sandbox-success',
    spawnProcess(spawnCommand, spawnArgs) {
      command = spawnCommand
      args = spawnArgs
      queueMicrotask(() => {
        child.stdout.write('hello\n')
        child.stderr.write('warning\n')
        child.emit('close', 0, null)
      })
      return child.asChildProcess()
    },
  })

  const result = await sandbox.execute({
    language: 'javascript',
    code: 'console.log("hello")',
    timeoutMs: 1_000,
  })

  assert.equal(command, 'docker-test')
  assert.equal(args.includes('node:test'), true)
  assert.equal(args.includes('console.log("hello")'), false)
  assert.equal(input, 'console.log("hello")')
  assert.deepEqual(result, {
    status: 'completed',
    stdout: 'hello\n',
    stderr: 'warning\n',
    exitCode: 0,
    signal: null,
    durationMs: result.durationMs,
    timedOut: false,
    outputTruncated: false,
  })
})

test('rejects requests outside hard service limits before spawning Docker', async () => {
  let spawned = false
  const sandbox = createDockerCodeSandbox({
    ...images,
    spawnProcess() {
      spawned = true
      return new FakeChildProcess().asChildProcess()
    },
  })

  await assert.rejects(
    sandbox.execute({
      language: 'javascript',
      code: 'console.log(1)',
      timeoutMs: 10_001,
    }),
    /timeout/,
  )
  assert.equal(spawned, false)
})

test('stops and removes a container when combined output exceeds the cap', async () => {
  const child = new FakeChildProcess()
  const removed: string[] = []
  const sandbox = createDockerCodeSandbox({
    ...images,
    maxOutputBytes: 8,
    createContainerName: () => 'sandbox-output-limit',
    spawnProcess() {
      queueMicrotask(() => child.stdout.write('0123456789'))
      return child.asChildProcess()
    },
    async removeContainer(_binary, name) {
      removed.push(name)
    },
  })

  const result = await sandbox.execute({
    language: 'python',
    code: 'print("hello")',
    timeoutMs: 1_000,
  })

  assert.equal(result.status, 'output_limit')
  assert.equal(result.stdout, '01234567')
  assert.equal(result.outputTruncated, true)
  assert.equal(child.killedWith, 'SIGKILL')
  assert.deepEqual(removed, ['sandbox-output-limit'])
})

test('stops and removes a container after the execution timeout', async () => {
  const child = new FakeChildProcess()
  const removed: string[] = []
  const sandbox = createDockerCodeSandbox({
    ...images,
    createContainerName: () => 'sandbox-timeout',
    spawnProcess: () => child.asChildProcess(),
    async removeContainer(_binary, name) {
      removed.push(name)
    },
  })

  const result = await sandbox.execute({
    language: 'javascript',
    code: 'while (true) {}',
    timeoutMs: 100,
  })

  assert.equal(result.status, 'timed_out')
  assert.equal(result.timedOut, true)
  assert.equal(child.killedWith, 'SIGKILL')
  assert.deepEqual(removed, ['sandbox-timeout'])
})

test('removes the container and rejects when the upstream signal aborts', async () => {
  const child = new FakeChildProcess()
  const controller = new AbortController()
  const removed: string[] = []
  const sandbox = createDockerCodeSandbox({
    ...images,
    createContainerName: () => 'sandbox-abort',
    spawnProcess: () => child.asChildProcess(),
    async removeContainer(_binary, name) {
      removed.push(name)
    },
  })

  const result = sandbox.execute(
    {
      language: 'javascript',
      code: 'await new Promise(() => {})',
      timeoutMs: 1_000,
    },
    { signal: controller.signal },
  )
  controller.abort()

  await assert.rejects(result, /aborted/)
  assert.equal(child.killedWith, 'SIGKILL')
  assert.deepEqual(removed, ['sandbox-abort'])
})

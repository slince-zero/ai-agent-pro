import assert from 'node:assert/strict'
import { test } from 'node:test'

import { runCli } from './app.js'

function capture() {
  let value = ''
  return {
    stream: {
      write(chunk: string | Uint8Array) {
        value += chunk.toString()
        return true
      },
    },
    value: () => value,
  }
}

test('shows the deliberately small command surface', () => {
  const stdout = capture()
  const stderr = capture()

  const exitCode = runCli(['--', 'help'], { stdout: stdout.stream, stderr: stderr.stream })

  assert.equal(exitCode, 0)
  assert.match(stdout.value(), /repo-agent doctor/)
  assert.match(stdout.value(), /intentionally not implemented/)
  assert.equal(stderr.value(), '')
})

test('doctor reports the current learning boundary', () => {
  const stdout = capture()
  const stderr = capture()

  const exitCode = runCli(
    ['doctor'],
    { stdout: stdout.stream, stderr: stderr.stream },
    { cwd: '/tmp/repository', nodeVersion: 'v22.18.0' },
  )

  assert.equal(exitCode, 0)
  assert.match(stdout.value(), /Node\.js v22\.18\.0: ok/)
  assert.match(stdout.value(), /Model client: not implemented/)
  assert.equal(stderr.value(), '')
})

test('rejects unknown commands with a useful next action', () => {
  const stdout = capture()
  const stderr = capture()

  const exitCode = runCli(['magic'], { stdout: stdout.stream, stderr: stderr.stream })

  assert.equal(exitCode, 1)
  assert.equal(stdout.value(), '')
  assert.match(stderr.value(), /Unknown command: magic/)
  assert.match(stderr.value(), /repo-agent help/)
})

import type { Writable } from 'node:stream'

export type CliIo = {
  stderr: Pick<Writable, 'write'>
  stdout: Pick<Writable, 'write'>
}

const HELP = `repo-agent - learn how repository understanding agents work

Usage:
  repo-agent help
  repo-agent doctor

Commands:
  help      Show this message
  doctor    Check the local learning environment

Agent features are intentionally not implemented yet.
Follow the learning sequence in README.md.
`

function writeLine(stream: Pick<Writable, 'write'>, message: string) {
  stream.write(`${message}\n`)
}

function nodeMajor(version: string) {
  return Number.parseInt(version.replace(/^v/, '').split('.')[0] ?? '', 10)
}

export function runCli(
  args: string[],
  io: CliIo,
  runtime: { cwd: string; nodeVersion: string } = {
    cwd: process.cwd(),
    nodeVersion: process.version,
  },
) {
  const command = args.find((arg) => arg !== '--') ?? 'help'

  if (command === 'help' || command === '--help' || command === '-h') {
    io.stdout.write(HELP)
    return 0
  }

  if (command === 'doctor') {
    const supportedNode = nodeMajor(runtime.nodeVersion) >= 22
    writeLine(
      io.stdout,
      `Node.js ${runtime.nodeVersion}: ${supportedNode ? 'ok' : 'requires v22+'}`,
    )
    writeLine(io.stdout, `Working directory: ${runtime.cwd}`)
    writeLine(io.stdout, 'Model client: not implemented (next learning step)')
    writeLine(io.stdout, 'Repository tools: not implemented (after model client)')
    return supportedNode ? 0 : 1
  }

  writeLine(io.stderr, `Unknown command: ${command}`)
  writeLine(io.stderr, 'Run "repo-agent help" to see available commands.')
  return 1
}

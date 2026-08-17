import type { Writable } from 'node:stream'

export type CliIo = {
  stderr: Pick<Writable, 'write'>
  stdout: Pick<Writable, 'write'>
}

const HELP = `repo-agent - learn how repository understanding agents work

Usage:
  repo-agent help

Commands:
  help      Show this message

Agent features are intentionally not implemented yet.
Follow the learning sequence in README.md.
`

function writeLine(stream: Pick<Writable, 'write'>, message: string) {
  stream.write(`${message}\n`)
}

export function runCli(args: string[], io: CliIo) {
  const command = args.find((arg) => arg !== '--') ?? 'help'

  if (command === 'help' || command === '--help' || command === '-h') {
    io.stdout.write(HELP)
    return 0
  }

  writeLine(io.stderr, `Unknown command: ${command}`)
  writeLine(io.stderr, 'Run "repo-agent help" to see available commands.')
  return 1
}

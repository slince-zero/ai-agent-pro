import { inspect } from 'node:util'

export function reportErrorLog(error: unknown) {
  process.stderr.write(inspect(error, { depth: 5, colors: true }) + '\n')
}

/* eslint-disable no-console */

import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'

import {
  assertSafeLocalDatabaseReset,
  formatDatabaseResetTarget,
} from '../src/db/local-reset-guard.js'
import { PrismaClient } from '../src/generated/prisma/client.js'

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://ai_agent:ai_agent@localhost:5432/ai_pro_agent'
const args = new Set(process.argv.slice(2))
const target = assertSafeLocalDatabaseReset(databaseUrl, {
  allowNonLocal: process.env.ALLOW_NON_LOCAL_DB_RESET === 'true',
  confirm: args.has('--confirm-local-reset'),
})

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
})

async function main() {
  console.log(`Resetting local database ${formatDatabaseResetTarget(target)}...`)

  await prisma.$transaction([
    prisma.citation.deleteMany(),
    prisma.toolCall.deleteMany(),
    prisma.agentRun.deleteMany(),
    prisma.sessionSummary.deleteMany(),
    prisma.memory.deleteMany(),
    prisma.documentChunk.deleteMany(),
    prisma.document.deleteMany(),
    prisma.message.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
  ])

  console.log('Database reset complete.')
}

try {
  await main()
} finally {
  await prisma.$disconnect()
}

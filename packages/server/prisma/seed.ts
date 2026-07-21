/* eslint-disable no-console */

import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { hashPassword } from 'better-auth/crypto'

import {
  MemoryScope,
  MemoryStatus,
  MessageRole,
  RunStatus,
  SessionStatus,
  ToolCallStatus,
} from '../src/generated/prisma/client.js'
import { PrismaClient } from '../src/generated/prisma/client.js'

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://ai_agent:ai_agent@localhost:5432/ai_pro_agent'
const defaultUserEmail = process.env.DEFAULT_USER_EMAIL ?? 'local@ai-pro-agent.dev'
const defaultUserPassword = process.env.DEFAULT_USER_PASSWORD

const seedIds = {
  user: 'seed-user-local',
  session: 'seed-session-agent-tour',
  userMessage: 'seed-message-user-tour',
  assistantMessage: 'seed-message-assistant-tour',
  run: 'seed-run-agent-tour',
  toolCall: 'seed-tool-call-github-repo',
  memory: 'seed-memory-agent-tour',
  summary: 'seed-session-summary-agent-tour',
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
})

async function main() {
  if (defaultUserPassword && defaultUserPassword.length < 8) {
    throw new Error('DEFAULT_USER_PASSWORD must contain at least 8 characters.')
  }

  const startedAt = new Date('2026-01-01T00:00:00.000Z')
  const finishedAt = new Date('2026-01-01T00:00:02.000Z')
  const credentialPassword = defaultUserPassword
    ? await hashPassword(defaultUserPassword)
    : undefined

  const user = await prisma.user.upsert({
    where: { email: defaultUserEmail },
    update: { name: 'Local Developer' },
    create: {
      id: seedIds.user,
      email: defaultUserEmail,
      name: 'Local Developer',
    },
  })

  await prisma.$transaction(async (tx) => {
    if (credentialPassword) {
      const account = await tx.account.findFirst({
        where: {
          accountId: user.id,
          providerId: 'credential',
        },
      })

      if (account) {
        await tx.account.update({
          where: { id: account.id },
          data: { password: credentialPassword },
        })
      } else {
        await tx.account.create({
          data: {
            accountId: user.id,
            providerId: 'credential',
            userId: user.id,
            password: credentialPassword,
          },
        })
      }
    }

    await tx.session.deleteMany({ where: { id: seedIds.session } })
    await tx.memory.deleteMany({ where: { id: seedIds.memory } })

    await tx.session.create({
      data: {
        id: seedIds.session,
        userId: user.id,
        title: 'Demo: explore ai-agent-pro',
        status: SessionStatus.ACTIVE,
        messages: {
          create: [
            {
              id: seedIds.userMessage,
              role: MessageRole.USER,
              content: '帮我快速了解这个仓库的结构，并指出下一步可以改进的方向。',
              metadata: {
                seed: true,
              },
              createdAt: startedAt,
            },
            {
              id: seedIds.assistantMessage,
              role: MessageRole.ASSISTANT,
              content:
                '这个项目已经具备聊天入口、持久化会话、工具调用、运行 trace、Memory/RAG/Eval 基础。下一步可以优先完善开发者体验，例如 reset/seed 脚本和示例数据。',
              metadata: {
                seed: true,
              },
              createdAt: finishedAt,
            },
          ],
        },
        summaries: {
          create: {
            id: seedIds.summary,
            content:
              'The seed session asks the agent to inspect ai-agent-pro and suggest next steps.',
            coveredMessageCount: 2,
            coveredThroughMessageId: seedIds.assistantMessage,
          },
        },
      },
    })

    await tx.agentRun.create({
      data: {
        id: seedIds.run,
        sessionId: seedIds.session,
        userMessageId: seedIds.userMessage,
        assistantMessageId: seedIds.assistantMessage,
        status: RunStatus.COMPLETED,
        model: 'seed/mock-agent',
        inputTokens: 328,
        outputTokens: 96,
        cost: 0,
        startedAt,
        finishedAt,
        toolCalls: {
          create: {
            id: seedIds.toolCall,
            toolCallId: 'call_seed_github_repo',
            name: 'github_repo',
            arguments: {
              owner: 'slince-zero',
              repo: 'ai-agent-pro',
            },
            result: JSON.stringify({
              fullName: 'slince-zero/ai-agent-pro',
              defaultBranch: 'main',
              language: 'TypeScript',
            }),
            status: ToolCallStatus.COMPLETED,
            durationMs: 42,
            startedAt,
            finishedAt,
          },
        },
      },
    })

    await tx.memory.create({
      data: {
        id: seedIds.memory,
        userId: user.id,
        sessionId: seedIds.session,
        scope: MemoryScope.SESSION,
        content: 'The demo user is evaluating ai-agent-pro as a general-purpose engineering agent.',
        metadata: {
          seed: true,
        },
        status: MemoryStatus.ACTIVE,
      },
    })
  })

  console.log(`Seeded demo data for ${defaultUserEmail}.`)
  if (credentialPassword) {
    console.log('Seeded a Better Auth credential account from DEFAULT_USER_PASSWORD.')
  }
  console.log(`Session: ${seedIds.session}`)
}

try {
  await main()
} finally {
  await prisma.$disconnect()
}

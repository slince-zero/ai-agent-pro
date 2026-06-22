import { prisma } from '../db/client.js'
import { MessageRole, RunStatus, SessionStatus } from '../generated/prisma/client.js'
import type { ClientMessage } from '../types/chat.js'

type SessionRecord = {
  id: string
  title: string
  status: SessionStatus
  createdAt: Date
  updatedAt: Date
}

type MessageRecord = {
  id: string
  role: MessageRole
  content: string
  createdAt: Date
}

type MessageWithUsage = MessageRecord & {
  assistantRuns?: {
    inputTokens: number | null
    outputTokens: number | null
    cost: number | null
  }[]
}

type SessionServiceDb = {
  session: {
    findMany: (args: unknown) => Promise<SessionRecord[]>
    create: (args: unknown) => Promise<SessionRecord>
    findFirst: (args: unknown) => Promise<SessionRecord | null>
    update: (args: unknown) => Promise<SessionRecord>
  }
  message: {
    create: (args: unknown) => Promise<MessageRecord>
    findMany: (args: unknown) => Promise<MessageWithUsage[]>
  }
}

type SessionServiceDeps = {
  db?: SessionServiceDb
}

export type ActiveSession = SessionRecord

function toTitle(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) return '新对话'
  return normalized.length > 40 ? `${normalized.slice(0, 40)}...` : normalized
}

function toClientRole(role: MessageRole): ClientMessage['role'] | null {
  if (role === MessageRole.USER) return 'user'
  if (role === MessageRole.ASSISTANT) return 'assistant'
  return null
}

export function serializeSession(session: SessionRecord) {
  return {
    id: session.id,
    title: session.title,
    status: session.status.toLowerCase(),
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  }
}

export function serializeMessage(
  message: MessageRecord,
  usage?: {
    inputTokens: number | null
    outputTokens: number | null
    cost: number | null
  },
) {
  const hasUsage =
    usage && usage.inputTokens != null && usage.outputTokens != null && usage.cost != null

  return {
    id: message.id,
    role: message.role.toLowerCase(),
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    ...(hasUsage
      ? {
          usage: {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cost: usage.cost,
          },
        }
      : {}),
  }
}

export function createSessionService({
  db = prisma as unknown as SessionServiceDb,
}: SessionServiceDeps = {}) {
  const getActiveSession = (userId: string, sessionId: string) =>
    db.session.findFirst({
      where: {
        id: sessionId,
        userId,
        status: SessionStatus.ACTIVE,
      },
    })

  return {
    async listActiveSessions(userId: string) {
      const sessions = await db.session.findMany({
        where: {
          userId,
          status: SessionStatus.ACTIVE,
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: 50,
      })

      return sessions.map(serializeSession)
    },

    async createSession(userId: string, title?: string) {
      const session = await db.session.create({
        data: {
          userId,
          title: title ?? '新对话',
        },
      })

      return serializeSession(session)
    },

    async getActiveSession(userId: string, sessionId: string) {
      return getActiveSession(userId, sessionId)
    },

    async listSessionMessages(userId: string, sessionId: string) {
      const session = await getActiveSession(userId, sessionId)
      if (!session) return null

      const messages = await db.message.findMany({
        where: {
          sessionId: session.id,
          role: {
            in: [MessageRole.USER, MessageRole.ASSISTANT],
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
        include: {
          assistantRuns: {
            where: { status: RunStatus.COMPLETED },
            select: { inputTokens: true, outputTokens: true, cost: true },
            take: 1,
          },
        },
      })

      return messages.map((message) => {
        const usage = message.assistantRuns?.[0]
        return serializeMessage(message, usage ?? undefined)
      })
    },

    async createUserMessage(sessionId: string, content: string) {
      return db.message.create({
        data: {
          sessionId,
          role: MessageRole.USER,
          content,
        },
      })
    },

    async createAssistantMessage(sessionId: string, content: string) {
      return db.message.create({
        data: {
          sessionId,
          role: MessageRole.ASSISTANT,
          content,
        },
      })
    },

    async updateTitleFromMessageIfNeeded(session: ActiveSession, content: string) {
      if (session.title !== '新对话') return session

      return db.session.update({
        where: {
          id: session.id,
        },
        data: {
          title: toTitle(content),
        },
      })
    },

    async touchSession(sessionId: string) {
      return db.session.update({
        where: {
          id: sessionId,
        },
        data: {
          updatedAt: new Date(),
        },
      })
    },

    async getRecentClientMessages(sessionId: string, take = 30) {
      const dbMessages = await db.message.findMany({
        where: {
          sessionId,
          role: {
            in: [MessageRole.USER, MessageRole.ASSISTANT],
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
        take,
      })

      return dbMessages
        .map((message) => {
          const role = toClientRole(message.role)
          return role ? { role, content: message.content } : null
        })
        .filter((message): message is ClientMessage => message !== null)
    },
  }
}

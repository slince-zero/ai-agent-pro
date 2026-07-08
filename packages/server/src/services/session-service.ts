import { prisma } from '../db/client.js'
import { MessageRole, Prisma, RunStatus, SessionStatus } from '../generated/prisma/client.js'
import type { ClientMessage } from '../types/chat.js'
import { serializeCitation } from './citation-service.js'

type SessionRecord = {
  id: string
  userId: string
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

type CitationRecord = {
  id: string
  messageId: string
  documentId: string | null
  documentChunkId: string | null
  title: string
  uri: string | null
  sourceRef: string | null
  snippet: string
  metadata: Prisma.JsonValue | null
  createdAt: Date
}

type MessageWithUsage = MessageRecord & {
  assistantRuns?: {
    inputTokens: number | null
    outputTokens: number | null
    cost: number | null
  }[]
  citations?: CitationRecord[]
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
    findFirst: (args: unknown) => Promise<MessageRecord | null>
    findMany: (args: unknown) => Promise<MessageWithUsage[]>
    update: (args: unknown) => Promise<MessageRecord>
  }
}

type SessionServiceDeps = {
  db?: SessionServiceDb
}

export type ActiveSession = SessionRecord

export type RegenerationTarget = {
  assistantMessage: MessageRecord
  userMessage: MessageRecord
}

function toTitle(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) return '新对话'
  return normalized.length > 40 ? `${normalized.slice(0, 40)}...` : normalized
}

function normalizeSessionTitle(title: string) {
  const normalized = title.replace(/\s+/g, ' ').trim()
  if (!normalized) throw new Error('title is required')
  return normalized.length > 120 ? normalized.slice(0, 120) : normalized
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
  message: MessageRecord & { citations?: CitationRecord[] },
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
    ...(message.citations && message.citations.length > 0
      ? { citations: message.citations.map(serializeCitation) }
      : {}),
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

    async renameActiveSession(userId: string, sessionId: string, title: string) {
      const session = await getActiveSession(userId, sessionId)
      if (!session) return null

      const updated = await db.session.update({
        where: {
          id: session.id,
        },
        data: {
          title: normalizeSessionTitle(title),
        },
      })

      return serializeSession(updated)
    },

    async archiveActiveSession(userId: string, sessionId: string) {
      const session = await getActiveSession(userId, sessionId)
      if (!session) return null

      const archived = await db.session.update({
        where: {
          id: session.id,
        },
        data: {
          status: SessionStatus.ARCHIVED,
        },
      })

      return serializeSession(archived)
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
            orderBy: {
              startedAt: 'desc',
            },
            select: { inputTokens: true, outputTokens: true, cost: true },
            take: 1,
          },
          citations: {
            orderBy: {
              createdAt: 'asc',
            },
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

    async updateAssistantMessage(messageId: string, content: string) {
      return db.message.update({
        where: {
          id: messageId,
        },
        data: {
          content,
        },
      })
    },

    async getLatestRegenerationTarget(sessionId: string): Promise<RegenerationTarget | null> {
      const userMessage = await db.message.findFirst({
        where: {
          sessionId,
          role: MessageRole.USER,
        },
        orderBy: {
          createdAt: 'desc',
        },
      })
      if (!userMessage) return null

      const assistantMessage = await db.message.findFirst({
        where: {
          sessionId,
          role: MessageRole.ASSISTANT,
          createdAt: {
            gt: userMessage.createdAt,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      })
      if (!assistantMessage) return null

      return { userMessage, assistantMessage }
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

    async getRecentClientMessages(
      sessionId: string,
      take: number,
      options: { excludeMessageIds?: string[] } = {},
    ) {
      const excludeMessageIds = options.excludeMessageIds?.filter(Boolean) ?? []
      const dbMessages = await db.message.findMany({
        where: {
          sessionId,
          ...(excludeMessageIds.length > 0
            ? {
                id: {
                  notIn: excludeMessageIds,
                },
              }
            : {}),
          role: {
            in: [MessageRole.USER, MessageRole.ASSISTANT],
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take,
      })

      return dbMessages
        .toReversed()
        .map((message) => {
          const role = toClientRole(message.role)
          return role ? { role, content: message.content } : null
        })
        .filter((message): message is ClientMessage => message !== null)
    },
  }
}

import { prisma } from '../db/client.js'
import { MemoryScope, MemoryStatus, Prisma } from '../generated/prisma/client.js'

const DEFAULT_MEMORY_LIMIT = 20
const MAX_MEMORY_LIMIT = 100
const MAX_MEMORY_CONTENT_CHARS = 4_000

export const MEMORY_WRITE_TRIGGERS = [
  'memoryService.createMemory',
  'memoryService.updateMemory',
  'memoryService.invalidateMemory',
] as const

type MemoryRecord = {
  id: string
  userId: string
  sessionId: string | null
  projectId: string | null
  scope: MemoryScope
  content: string
  metadata: Prisma.JsonValue | null
  status: MemoryStatus
  createdAt: Date
  updatedAt: Date
  invalidatedAt: Date | null
}

type MemoryServiceDb = {
  memory: {
    create: (args: unknown) => Promise<MemoryRecord>
    findMany: (args: unknown) => Promise<MemoryRecord[]>
    update: (args: unknown) => Promise<MemoryRecord>
  }
}

type MemoryServiceDeps = {
  db?: MemoryServiceDb
}

export type MemoryScopeInput = 'user' | 'session' | 'project'

export type CreateMemoryInput = {
  userId: string
  scope: MemoryScopeInput
  content: string
  sessionId?: string | null
  projectId?: string | null
  metadata?: unknown
}

export type UpdateMemoryInput = {
  userId: string
  memoryId: string
  content?: string
  metadata?: unknown
}

export type ListMemoriesInput = {
  userId: string
  scope?: MemoryScopeInput
  sessionId?: string
  projectId?: string
  query?: string
  includeInvalidated?: boolean
  limit?: number
}

export type InvalidateMemoryInput = {
  userId: string
  memoryId: string
}

function assertNonEmpty(value: string | undefined | null, field: string) {
  if (!value || !value.trim()) {
    throw new Error(`${field} is required`)
  }
}

function normalizeContent(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) throw new Error('content is required')
  if (normalized.length > MAX_MEMORY_CONTENT_CHARS) {
    throw new Error(`content must be ${MAX_MEMORY_CONTENT_CHARS} characters or less`)
  }
  return normalized
}

function normalizeLimit(limit: number | undefined) {
  if (!Number.isFinite(limit) || limit == null) return DEFAULT_MEMORY_LIMIT

  const normalized = Math.floor(limit)
  if (normalized <= 0) return DEFAULT_MEMORY_LIMIT
  return Math.min(normalized, MAX_MEMORY_LIMIT)
}

function toMemoryScope(scope: MemoryScopeInput) {
  if (scope === 'user') return MemoryScope.USER
  if (scope === 'session') return MemoryScope.SESSION
  if (scope === 'project') return MemoryScope.PROJECT

  throw new Error('scope must be user, session, or project')
}

function validateScope(input: Pick<CreateMemoryInput, 'scope' | 'sessionId' | 'projectId'>) {
  if (input.scope === 'user') {
    if (input.sessionId || input.projectId) {
      throw new Error('user memory cannot include sessionId or projectId')
    }
    return
  }

  if (input.scope === 'session') {
    assertNonEmpty(input.sessionId, 'sessionId')
    if (input.projectId) throw new Error('session memory cannot include projectId')
    return
  }

  if (input.scope === 'project') {
    assertNonEmpty(input.projectId, 'projectId')
    if (input.sessionId) throw new Error('project memory cannot include sessionId')
    return
  }

  toMemoryScope(input.scope)
}

function toJsonValue(value: unknown) {
  return value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue)
}

function toLowerStatus(status: { toString: () => string }) {
  return status.toString().toLowerCase()
}

export function serializeMemory(memory: MemoryRecord) {
  return {
    id: memory.id,
    userId: memory.userId,
    scope: toLowerStatus(memory.scope) as MemoryScopeInput,
    sessionId: memory.sessionId,
    projectId: memory.projectId,
    content: memory.content,
    metadata: memory.metadata,
    status: toLowerStatus(memory.status),
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
    invalidatedAt: memory.invalidatedAt?.toISOString() ?? null,
  }
}

export function createMemoryService({
  db = prisma as unknown as MemoryServiceDb,
}: MemoryServiceDeps = {}) {
  return {
    async createMemory(input: CreateMemoryInput) {
      assertNonEmpty(input.userId, 'userId')
      validateScope(input)

      const memory = await db.memory.create({
        data: {
          userId: input.userId,
          scope: toMemoryScope(input.scope),
          sessionId: input.scope === 'session' ? input.sessionId : null,
          projectId: input.scope === 'project' ? input.projectId : null,
          content: normalizeContent(input.content),
          metadata: toJsonValue(input.metadata),
        },
      })

      return serializeMemory(memory)
    },

    async updateMemory(input: UpdateMemoryInput) {
      assertNonEmpty(input.userId, 'userId')
      assertNonEmpty(input.memoryId, 'memoryId')

      const data: Record<string, unknown> = {
        updatedAt: new Date(),
      }

      if (input.content !== undefined) {
        data.content = normalizeContent(input.content)
      }

      if (input.metadata !== undefined) {
        data.metadata = toJsonValue(input.metadata)
      }

      if (!('content' in data) && !('metadata' in data)) {
        throw new Error('content or metadata is required')
      }

      const memory = await db.memory.update({
        where: {
          id: input.memoryId,
          userId: input.userId,
          status: MemoryStatus.ACTIVE,
        },
        data,
      })

      return serializeMemory(memory)
    },

    async listMemories(input: ListMemoriesInput) {
      assertNonEmpty(input.userId, 'userId')

      const where: Record<string, unknown> = {
        userId: input.userId,
        ...(input.includeInvalidated ? {} : { status: MemoryStatus.ACTIVE }),
        ...(input.scope ? { scope: toMemoryScope(input.scope) } : {}),
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.query?.trim()
          ? {
              content: {
                contains: input.query.trim(),
                mode: 'insensitive',
              },
            }
          : {}),
      }

      const memories = await db.memory.findMany({
        where,
        orderBy: {
          updatedAt: 'desc',
        },
        take: normalizeLimit(input.limit),
      })

      return memories.map(serializeMemory)
    },

    async invalidateMemory(input: InvalidateMemoryInput) {
      assertNonEmpty(input.userId, 'userId')
      assertNonEmpty(input.memoryId, 'memoryId')

      const invalidatedAt = new Date()
      const memory = await db.memory.update({
        where: {
          id: input.memoryId,
          userId: input.userId,
          status: MemoryStatus.ACTIVE,
        },
        data: {
          status: MemoryStatus.INVALIDATED,
          invalidatedAt,
          updatedAt: invalidatedAt,
        },
      })

      return serializeMemory(memory)
    },
  }
}

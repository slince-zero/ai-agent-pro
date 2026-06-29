import { prisma } from '../db/client.js'
import { DocumentSource, DocumentStatus, Prisma } from '../generated/prisma/client.js'

const DEFAULT_DOCUMENT_LIMIT = 20
const MAX_DOCUMENT_LIMIT = 100
const MAX_CHUNKS_PER_DOCUMENT = 1_000
const MAX_CHUNK_CONTENT_CHARS = 20_000

type DocumentRecord = {
  id: string
  userId: string
  projectId: string | null
  source: DocumentSource
  externalId: string | null
  title: string
  uri: string | null
  mimeType: string | null
  contentHash: string | null
  metadata: Prisma.JsonValue | null
  status: DocumentStatus
  createdAt: Date
  updatedAt: Date
}

type DocumentChunkRecord = {
  id: string
  documentId: string
  chunkIndex: number
  content: string
  contentHash: string | null
  sourceRef: string | null
  startOffset: number | null
  endOffset: number | null
  metadata: Prisma.JsonValue | null
  createdAt: Date
  updatedAt: Date
}

type DocumentWithChunksRecord = DocumentRecord & {
  chunks?: DocumentChunkRecord[]
}

type DocumentServiceDb = {
  document: {
    create: (args: unknown) => Promise<DocumentRecord>
    findMany: (args: unknown) => Promise<DocumentRecord[]>
    update: (args: unknown) => Promise<DocumentWithChunksRecord>
  }
  documentChunk: {
    findMany: (args: unknown) => Promise<DocumentChunkRecord[]>
  }
}

type DocumentServiceDeps = {
  db?: DocumentServiceDb
}

export type DocumentSourceInput = 'text' | 'github' | 'url' | 'file'

export type CreateDocumentInput = {
  userId: string
  source: DocumentSourceInput
  title: string
  projectId?: string | null
  externalId?: string | null
  uri?: string | null
  mimeType?: string | null
  contentHash?: string | null
  metadata?: unknown
}

export type ListDocumentsInput = {
  userId: string
  projectId?: string
  source?: DocumentSourceInput
  query?: string
  includeArchived?: boolean
  limit?: number
}

export type DocumentChunkInput = {
  chunkIndex?: number
  content: string
  contentHash?: string | null
  sourceRef?: string | null
  startOffset?: number | null
  endOffset?: number | null
  metadata?: unknown
}

export type ReplaceDocumentChunksInput = {
  userId: string
  documentId: string
  chunks: DocumentChunkInput[]
}

export type ListDocumentChunksInput = {
  userId: string
  documentId: string
  limit?: number
}

function assertNonEmpty(value: string | undefined | null, field: string) {
  if (!value || !value.trim()) {
    throw new Error(`${field} is required`)
  }
}

function normalizeRequiredString(value: string, field: string) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) throw new Error(`${field} is required`)
  return normalized
}

function normalizeOptionalString(value: string | undefined | null) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function normalizeLimit(limit: number | undefined) {
  if (!Number.isFinite(limit) || limit == null) return DEFAULT_DOCUMENT_LIMIT

  const normalized = Math.floor(limit)
  if (normalized <= 0) return DEFAULT_DOCUMENT_LIMIT
  return Math.min(normalized, MAX_DOCUMENT_LIMIT)
}

function toDocumentSource(source: DocumentSourceInput) {
  if (source === 'text') return DocumentSource.TEXT
  if (source === 'github') return DocumentSource.GITHUB
  if (source === 'url') return DocumentSource.URL
  if (source === 'file') return DocumentSource.FILE

  throw new Error('source must be text, github, url, or file')
}

function toJsonValue(value: unknown) {
  return value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue)
}

function toLowerStatus(status: { toString: () => string }) {
  return status.toString().toLowerCase()
}

function normalizeChunkIndex(value: number | undefined, fallback: number) {
  const chunkIndex = value ?? fallback
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    throw new Error('chunkIndex must be a non-negative integer')
  }
  return chunkIndex
}

function normalizeOffset(value: number | undefined | null, field: string) {
  if (value == null) return null
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`)
  }
  return value
}

function normalizeChunkContent(content: string) {
  const normalized = content.trim()
  if (!normalized) throw new Error('chunk content is required')
  if (normalized.length > MAX_CHUNK_CONTENT_CHARS) {
    throw new Error(`chunk content must be ${MAX_CHUNK_CONTENT_CHARS} characters or less`)
  }
  return normalized
}

function normalizeChunkData(chunks: DocumentChunkInput[]) {
  if (chunks.length === 0) throw new Error('chunks are required')
  if (chunks.length > MAX_CHUNKS_PER_DOCUMENT) {
    throw new Error(`chunks must contain ${MAX_CHUNKS_PER_DOCUMENT} items or fewer`)
  }

  const seenIndexes = new Set<number>()

  return chunks.map((chunk, index) => {
    const chunkIndex = normalizeChunkIndex(chunk.chunkIndex, index)
    if (seenIndexes.has(chunkIndex)) throw new Error('chunkIndex values must be unique')
    seenIndexes.add(chunkIndex)

    const startOffset = normalizeOffset(chunk.startOffset, 'startOffset')
    const endOffset = normalizeOffset(chunk.endOffset, 'endOffset')
    if (startOffset != null && endOffset != null && endOffset < startOffset) {
      throw new Error('endOffset must be greater than or equal to startOffset')
    }

    return {
      chunkIndex,
      content: normalizeChunkContent(chunk.content),
      contentHash: normalizeOptionalString(chunk.contentHash),
      sourceRef: normalizeOptionalString(chunk.sourceRef),
      startOffset,
      endOffset,
      metadata: toJsonValue(chunk.metadata),
    }
  })
}

export function serializeDocumentChunk(chunk: DocumentChunkRecord) {
  return {
    id: chunk.id,
    documentId: chunk.documentId,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    contentHash: chunk.contentHash,
    sourceRef: chunk.sourceRef,
    startOffset: chunk.startOffset,
    endOffset: chunk.endOffset,
    metadata: chunk.metadata,
    createdAt: chunk.createdAt.toISOString(),
    updatedAt: chunk.updatedAt.toISOString(),
  }
}

export function serializeDocument(document: DocumentWithChunksRecord) {
  const serialized = {
    id: document.id,
    userId: document.userId,
    projectId: document.projectId,
    source: toLowerStatus(document.source) as DocumentSourceInput,
    externalId: document.externalId,
    title: document.title,
    uri: document.uri,
    mimeType: document.mimeType,
    contentHash: document.contentHash,
    metadata: document.metadata,
    status: toLowerStatus(document.status),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  }

  return document.chunks
    ? {
        ...serialized,
        chunks: document.chunks.map(serializeDocumentChunk),
      }
    : serialized
}

export function createDocumentService({
  db = prisma as unknown as DocumentServiceDb,
}: DocumentServiceDeps = {}) {
  return {
    async createDocument(input: CreateDocumentInput) {
      assertNonEmpty(input.userId, 'userId')

      const document = await db.document.create({
        data: {
          userId: input.userId,
          projectId: normalizeOptionalString(input.projectId),
          source: toDocumentSource(input.source),
          externalId: normalizeOptionalString(input.externalId),
          title: normalizeRequiredString(input.title, 'title'),
          uri: normalizeOptionalString(input.uri),
          mimeType: normalizeOptionalString(input.mimeType),
          contentHash: normalizeOptionalString(input.contentHash),
          metadata: toJsonValue(input.metadata),
        },
      })

      return serializeDocument(document)
    },

    async listDocuments(input: ListDocumentsInput) {
      assertNonEmpty(input.userId, 'userId')

      const documents = await db.document.findMany({
        where: {
          userId: input.userId,
          ...(input.includeArchived ? {} : { status: DocumentStatus.ACTIVE }),
          ...(input.projectId ? { projectId: input.projectId } : {}),
          ...(input.source ? { source: toDocumentSource(input.source) } : {}),
          ...(input.query?.trim()
            ? {
                title: {
                  contains: input.query.trim(),
                  mode: 'insensitive',
                },
              }
            : {}),
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: normalizeLimit(input.limit),
      })

      return documents.map(serializeDocument)
    },

    async replaceDocumentChunks(input: ReplaceDocumentChunksInput) {
      assertNonEmpty(input.userId, 'userId')
      assertNonEmpty(input.documentId, 'documentId')

      const document = await db.document.update({
        where: {
          id: input.documentId,
          userId: input.userId,
          status: DocumentStatus.ACTIVE,
        },
        data: {
          updatedAt: new Date(),
          chunks: {
            deleteMany: {},
            createMany: {
              data: normalizeChunkData(input.chunks),
            },
          },
        },
        include: {
          chunks: {
            orderBy: {
              chunkIndex: 'asc',
            },
          },
        },
      })

      return serializeDocument(document)
    },

    async listDocumentChunks(input: ListDocumentChunksInput) {
      assertNonEmpty(input.userId, 'userId')
      assertNonEmpty(input.documentId, 'documentId')

      const chunks = await db.documentChunk.findMany({
        where: {
          documentId: input.documentId,
          document: {
            userId: input.userId,
            status: DocumentStatus.ACTIVE,
          },
        },
        orderBy: {
          chunkIndex: 'asc',
        },
        take: normalizeLimit(input.limit),
      })

      return chunks.map(serializeDocumentChunk)
    },
  }
}

export type DocumentService = ReturnType<typeof createDocumentService>

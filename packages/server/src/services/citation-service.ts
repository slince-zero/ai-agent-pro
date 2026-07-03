import { prisma } from '../db/client.js'
import { Prisma } from '../generated/prisma/client.js'
import type { RetrievalContextItem } from '../runtime/context-builder.js'

const MAX_CITATIONS_PER_MESSAGE = 5
const MAX_CITATION_SNIPPET_CHARS = 280

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

type CitationDb = {
  citation: {
    create: (args: unknown) => Promise<CitationRecord>
  }
}

type CitationServiceDeps = {
  db?: CitationDb
}

export type Citation = {
  id: string
  messageId: string
  documentId: string | null
  chunkId: string | null
  title: string
  uri: string | null
  sourceRef: string | null
  snippet: string
  metadata: Prisma.JsonValue | null
  createdAt: string
}

export type CreateMessageCitationsInput = {
  messageId: string
  sources: RetrievalContextItem[]
}

type NormalizedCitationInput = {
  documentId: string | null
  documentChunkId: string | null
  title: string
  uri: string | null
  sourceRef: string | null
  snippet: string
  metadata: Prisma.InputJsonValue
}

function normalizeText(value: string | undefined | null) {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  return normalized || null
}

function normalizeTitle(value: string | undefined | null) {
  return normalizeText(value) ?? 'Untitled source'
}

function truncateSnippet(value: string) {
  if (value.length <= MAX_CITATION_SNIPPET_CHARS) return value
  return `${value.slice(0, MAX_CITATION_SNIPPET_CHARS - 3).trimEnd()}...`
}

function citationKey(
  citation: Pick<NormalizedCitationInput, 'documentChunkId' | 'sourceRef' | 'uri'>,
) {
  return citation.documentChunkId ?? citation.sourceRef ?? citation.uri ?? ''
}

function toCitationMetadata(source: RetrievalContextItem) {
  return {
    chunkIndex: source.chunkIndex ?? null,
    projectId: source.projectId ?? null,
    score: source.score ?? null,
  } satisfies Prisma.InputJsonObject
}

export function normalizeCitationSources(sources: RetrievalContextItem[]) {
  const seen = new Set<string>()
  const citations: NormalizedCitationInput[] = []

  for (const source of sources) {
    const snippet = normalizeText(source.content)
    if (!snippet) continue

    const citation = {
      documentId: normalizeText(source.documentId),
      documentChunkId: normalizeText(source.chunkId),
      title: normalizeTitle(source.title),
      uri: normalizeText(source.uri),
      sourceRef: normalizeText(source.sourceRef),
      snippet: truncateSnippet(snippet),
      metadata: toCitationMetadata(source),
    }
    const key = citationKey(citation)
    if (key && seen.has(key)) continue
    if (key) seen.add(key)

    citations.push(citation)
    if (citations.length >= MAX_CITATIONS_PER_MESSAGE) break
  }

  return citations
}

export function serializeCitation(citation: CitationRecord): Citation {
  return {
    id: citation.id,
    messageId: citation.messageId,
    documentId: citation.documentId,
    chunkId: citation.documentChunkId,
    title: citation.title,
    uri: citation.uri,
    sourceRef: citation.sourceRef,
    snippet: citation.snippet,
    metadata: citation.metadata,
    createdAt: citation.createdAt.toISOString(),
  }
}

export function createCitationService({
  db = prisma as unknown as CitationDb,
}: CitationServiceDeps = {}) {
  return {
    async createMessageCitations({ messageId, sources }: CreateMessageCitationsInput) {
      const inputs = normalizeCitationSources(sources)
      const citations: Citation[] = []

      for (const input of inputs) {
        const citation = await db.citation.create({
          data: {
            messageId,
            documentId: input.documentId,
            documentChunkId: input.documentChunkId,
            title: input.title,
            uri: input.uri,
            sourceRef: input.sourceRef,
            snippet: input.snippet,
            metadata: input.metadata,
          },
        })
        citations.push(serializeCitation(citation))
      }

      return citations
    },
  }
}

export type CitationService = ReturnType<typeof createCitationService>

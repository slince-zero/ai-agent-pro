import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

import { z } from 'zod'

import type { AppTool } from './types.js'

const FETCH_TIMEOUT_MS = 10_000
const MAX_RESPONSE_BYTES = 1_000_000
const MAX_TEXT_CHARS = 30_000
const MAX_REDIRECTS = 5
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

const webFetchSchema = z
  .object({
    url: z.string().trim().url(),
  })
  .strict()
  .refine(
    (args) => {
      const protocol = new URL(args.url).protocol
      return protocol === 'http:' || protocol === 'https:'
    },
    { message: '只支持 http 或 https URL。' },
  )

type WebFetchArgs = z.infer<typeof webFetchSchema>

class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeUrlError'
  }
}

function stripIpv6Brackets(hostname: string) {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
}

function isLocalHostname(hostname: string) {
  const normalized = stripIpv6Brackets(hostname).toLowerCase().replace(/\.$/, '')
  return normalized === 'localhost' || normalized.endsWith('.localhost')
}

function parseIpv4(address: string) {
  const parts = address.split('.')
  if (parts.length !== 4) return null

  const bytes = parts.map((part) => Number(part))
  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) return null

  return bytes
}

function isPrivateIpv4(address: string) {
  const bytes = parseIpv4(address)
  if (!bytes) return false

  const [a, b, c] = bytes

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  )
}

function parseIpv6(address: string) {
  let normalized = address.toLowerCase()

  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':')
    const ipv4 = normalized.slice(lastColon + 1)
    const bytes = parseIpv4(ipv4)
    if (!bytes) return null

    normalized = `${normalized.slice(0, lastColon)}:${((bytes[0] << 8) | bytes[1]).toString(
      16,
    )}:${((bytes[2] << 8) | bytes[3]).toString(16)}`
  }

  const compressedParts = normalized.split('::')
  if (compressedParts.length > 2) return null

  const head = compressedParts[0]?.split(':').filter(Boolean) ?? []
  const tail = compressedParts[1]?.split(':').filter(Boolean) ?? []
  const zeroCount = compressedParts.length === 2 ? 8 - head.length - tail.length : 0
  const hextets = [...head, ...Array<string>(zeroCount).fill('0'), ...tail]

  if (hextets.length !== 8) return null

  let value = 0n
  for (const hextet of hextets) {
    if (!/^[0-9a-f]{1,4}$/i.test(hextet)) return null
    value = (value << 16n) + BigInt(Number.parseInt(hextet, 16))
  }

  return value
}

function matchesIpv6Cidr(address: bigint, base: bigint, prefixBits: number) {
  const shift = 128n - BigInt(prefixBits)
  return address >> shift === base >> shift
}

function ipv4FromMappedIpv6(address: bigint) {
  const bytes = [
    Number((address >> 24n) & 255n),
    Number((address >> 16n) & 255n),
    Number((address >> 8n) & 255n),
    Number(address & 255n),
  ]

  return bytes.join('.')
}

function isPrivateIpv6(address: string) {
  const value = parseIpv6(address)
  const unspecified = parseIpv6('::')
  const loopback = parseIpv6('::1')
  const ipv4Mapped = parseIpv6('::ffff:0:0')
  const uniqueLocal = parseIpv6('fc00::')
  const linkLocal = parseIpv6('fe80::')
  const multicast = parseIpv6('ff00::')
  const documentation = parseIpv6('2001:db8::')

  if (
    value === null ||
    unspecified === null ||
    loopback === null ||
    ipv4Mapped === null ||
    uniqueLocal === null ||
    linkLocal === null ||
    multicast === null ||
    documentation === null
  ) {
    return true
  }

  if (value === unspecified || value === loopback) return true

  if (matchesIpv6Cidr(value, ipv4Mapped, 96)) {
    return isPrivateIpv4(ipv4FromMappedIpv6(value))
  }

  return (
    matchesIpv6Cidr(value, uniqueLocal, 7) ||
    matchesIpv6Cidr(value, linkLocal, 10) ||
    matchesIpv6Cidr(value, multicast, 8) ||
    matchesIpv6Cidr(value, documentation, 32)
  )
}

function isPrivateAddress(address: string) {
  const normalized = stripIpv6Brackets(address)
  const version = isIP(normalized)

  if (version === 4) return isPrivateIpv4(normalized)
  if (version === 6) return isPrivateIpv6(normalized)

  return false
}

async function assertPublicHttpUrl(url: URL) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('只支持 http 或 https URL。')
  }

  const hostname = stripIpv6Brackets(url.hostname)

  if (isLocalHostname(hostname)) {
    throw new UnsafeUrlError('出于安全原因，web_fetch 不允许访问 localhost 地址。')
  }

  if (isPrivateAddress(hostname)) {
    throw new UnsafeUrlError('出于安全原因，web_fetch 不允许访问内网、本机或保留地址。')
  }

  if (isIP(hostname)) return

  let addresses: { address: string }[]
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true })
  } catch (error) {
    throw new UnsafeUrlError(`DNS 解析失败：${(error as Error).message}`)
  }

  if (addresses.length === 0) {
    throw new UnsafeUrlError('DNS 解析失败：没有可用地址。')
  }

  if (addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new UnsafeUrlError('出于安全原因，web_fetch 不允许访问解析到内网、本机或保留地址的主机。')
  }
}

async function fetchPublicUrl(url: string, signal: AbortSignal) {
  let currentUrl = new URL(url)

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    await assertPublicHttpUrl(currentUrl)

    const response = await fetch(currentUrl, {
      headers: {
        Accept: 'text/html,text/plain,application/json,application/xml;q=0.9,*/*;q=0.1',
        'User-Agent': 'ai-pro-agent',
      },
      redirect: 'manual',
      signal,
    })

    if (!REDIRECT_STATUSES.has(response.status)) {
      return { response, finalUrl: currentUrl.toString() }
    }

    const location = response.headers.get('location')
    if (!location) {
      return { response, finalUrl: currentUrl.toString() }
    }

    if (redirectCount === MAX_REDIRECTS) {
      throw new UnsafeUrlError(`重定向次数超过上限（${MAX_REDIRECTS} 次）。`)
    }

    currentUrl = new URL(location, currentUrl)
  }

  throw new UnsafeUrlError(`重定向次数超过上限（${MAX_REDIRECTS} 次）。`)
}

function isSupportedContentType(contentType: string) {
  const normalized = contentType.toLowerCase()

  return (
    normalized.startsWith('text/') ||
    normalized.includes('application/json') ||
    normalized.includes('application/xml') ||
    normalized.includes('application/xhtml+xml')
  )
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!match) return ''

  return normalizeWhitespace(decodeHtmlEntities(match[1]))
}

function stripHtml(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function toReadableText(raw: string, contentType: string) {
  const isHtml = contentType.toLowerCase().includes('html') || /<\/?[a-z][\s\S]*>/i.test(raw)
  const text = isHtml ? stripHtml(raw) : raw

  return normalizeWhitespace(decodeHtmlEntities(text))
}

function truncateText(text: string) {
  if (text.length <= MAX_TEXT_CHARS) {
    return { text, truncated: false }
  }

  return {
    text: text.slice(0, MAX_TEXT_CHARS),
    truncated: true,
  }
}

export const webFetchTool: AppTool<WebFetchArgs> = {
  name: 'web_fetch',
  description:
    '读取一个公开 http/https URL 的文本内容，用于分析技术文档、博客文章、网页说明或接口返回的文本。返回标题、状态码、content-type 和清洗后的正文预览；不要用于 GitHub 仓库元数据查询，GitHub 仓库概况优先使用 github_repository_lookup。',
  governance: {
    category: 'web',
    sideEffect: false,
    requiresAuth: false,
    timeoutMs: FETCH_TIMEOUT_MS,
  },
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: "要读取的公开 http/https URL，例如 'https://example.com/docs'。",
      },
    },
    required: ['url'],
    additionalProperties: false,
  },
  schema: webFetchSchema,
  async run(args) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    let response: Response
    let finalUrl = args.url
    try {
      const result = await fetchPublicUrl(args.url, controller.signal)
      response = result.response
      finalUrl = result.finalUrl
    } catch (error) {
      clearTimeout(timeout)
      return JSON.stringify({
        error:
          error instanceof UnsafeUrlError
            ? error.message
            : (error as Error).name === 'AbortError'
              ? `请求超时：超过 ${FETCH_TIMEOUT_MS / 1000} 秒未响应。`
              : `网络请求失败：${(error as Error).message}`,
        url: args.url,
      })
    }

    try {
      const contentType = response.headers.get('content-type') ?? ''
      const contentLength = Number(response.headers.get('content-length') ?? 0)

      if (!response.ok) {
        return JSON.stringify({
          error: `网页读取失败：HTTP ${response.status}`,
          url: args.url,
          final_url: finalUrl,
          status: response.status,
          content_type: contentType,
        })
      }

      if (contentLength > MAX_RESPONSE_BYTES) {
        return JSON.stringify({
          error: `响应内容过大：${contentLength} bytes，超过 ${MAX_RESPONSE_BYTES} bytes 限制。`,
          url: args.url,
          final_url: finalUrl,
          status: response.status,
          content_type: contentType,
        })
      }

      if (!isSupportedContentType(contentType)) {
        return JSON.stringify({
          error: '不支持读取该内容类型，当前工具只处理文本、HTML、JSON 或 XML。',
          url: args.url,
          final_url: finalUrl,
          status: response.status,
          content_type: contentType || 'unknown',
        })
      }

      const raw = await response.text()
      const readableText = toReadableText(raw, contentType)
      const { text, truncated } = truncateText(readableText)

      return JSON.stringify(
        {
          url: args.url,
          final_url: finalUrl,
          status: response.status,
          content_type: contentType,
          title: extractTitle(raw),
          text,
          truncated,
        },
        null,
        2,
      )
    } catch (error) {
      return JSON.stringify({
        error:
          (error as Error).name === 'AbortError'
            ? `请求超时：超过 ${FETCH_TIMEOUT_MS / 1000} 秒未响应。`
            : `网络请求失败：${(error as Error).message}`,
        url: args.url,
      })
    } finally {
      clearTimeout(timeout)
    }
  },
}

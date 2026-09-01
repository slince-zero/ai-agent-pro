import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
} from 'openai/resources/index.mjs'
import type { EvidenceSource, ToolSource } from '@ai-agent-pro/shared/type.js'
import { agentLimits } from '../util.js'

/** 界面上那行摘要最多这么长——再长也只是把工具链的排版撑破 */
const TOOL_PREVIEW_MAX_LENGTH = 120

/*
 * 上线的命中数和每条的长度上限。
 *
 * 五条是 Tavily 单次的上限，也刚好是一屏能扫完的量；标题和摘要裁到这个长度，
 * 一次搜索的结果加起来约 1.5 KB——够判断值不值得点开，又不至于把整份摘要搬过去。
 * 模型和界面读的是同一份裁剪结果：两边不一致的话，用户会以为模型漏看了什么。
 */
const TOOL_SOURCE_MAX_COUNT = 5
const TOOL_SOURCE_TITLE_MAX_LENGTH = 120
const TOOL_SOURCE_SNIPPET_MAX_LENGTH = 160

/**
 * 失败原因给人看的说法。
 *
 * 工具返回的 error 码和 message 是写给模型的（英文、固定措辞），直接摆到时间轴上
 * 就是一句 "budget_exhausted · No search call left."——用户读不出这是产品的限额。
 * 所以这里把已知的失败翻一遍；未知的码保持原样，出了新错误不会被吞掉。
 */
const toolErrorPreview: Record<string, string> = {
  invalid_tool_arguments: '参数不合法',
  budget_exhausted: '这一次检索的调用次数已用完',
  rate_limited: '被提供方限流',
  tool_unavailable: '工具不可用',
  provider_error: '提供方请求失败',
  unknown_tool: '未知工具',
}

/**
 * 这一步之后还剩多少额度。
 *
 * 跟着每条工具结果一起发给模型，而不是另开一条 system 消息：额度是随时间变的，
 * 写在消息列表末尾就只影响新增的那一段，前面的前缀还能命中缓存。
 */
export type RunStatus = {
  /** 之后还有几轮可以调工具 */
  roundsLeft: number
  searchLeft: number
  pageLeft: number
}

/**
 * 读回一整页正文的那条工具结果。
 *
 * 它单独存成一种条目，而不是像别的结果那样把 JSON 定死：正文是上下文里唯一
 * 会失控增长的东西，得留着原料，才能在每次投喂前重新决定这一页给全文还是给摘录。
 */
type PageEntry = {
  kind: 'page'
  toolCallId: string
  ref: number
  url: string
  body: string
  truncated: boolean
  status: RunStatus
}

/** 内容一次定稿、之后原样重发的工具结果：搜索命中、各种失败 */
type FixedEntry = {
  kind: 'fixed'
  toolCallId: string
  content: string
}

/** 循环自己写下的消息，目前只有带 tool_calls 的 assistant */
type ChatEntry = {
  kind: 'chat'
  message: ChatCompletionMessageParam
}

type LedgerEntry = ChatEntry | FixedEntry | PageEntry

/**
 * 一次运行的账本。
 *
 * 服务端唯一的事实来源：tool 结果、引用编号、上下文预算都从这里长出来。
 * 客户端永远只拿到它的投影（一行摘要、裁剪过的来源），拿不到原料，
 * 因此也没法伪造工具结果——这条边界是整个循环可信的前提。
 *
 * 写成数据加一组自由函数，和 ToolBudget / spendToolBudget 一个路子：
 * 状态摊开摆着，谁改了什么一眼看得见。
 */
export type RetrievalLedger = {
  system: string
  /** 结构化的检索意图，渲染成一段文本；没解析出来时是空串 */
  intent: string
  /** 客户端提交的对话，循环不改动它 */
  history: ChatCompletionMessageParam[]
  entries: LedgerEntry[]
  /** 规范化地址 → 这一次运行给它的来源记录，插入顺序就是引用编号顺序 */
  sources: Map<string, EvidenceSource>
}

/** 一条工具结果在界面上需要的东西：成没成、拿回了什么、搜到了哪些来源 */
export type ToolResultView = {
  ok: boolean
  preview?: string
  sources?: ToolSource[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function readString(source: Record<string, unknown> | undefined, key: string) {
  const value = source?.[key]

  return typeof value === 'string' ? value : ''
}

function condense(value: string, maxLength = TOOL_PREVIEW_MAX_LENGTH) {
  const collapsed = value.replace(/\s+/g, ' ').trim()

  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength - 1)}…` : collapsed
}

/**
 * 同一个页面的两种写法要认成一个来源。
 *
 * `#section` 和末尾那个斜杠都不改变页面内容，而 read_page 拿回的地址常常和搜索
 * 给出的差这么一点。不归一化的话，同一页会拿到两个引用编号，答案里的 [2] 和 [5]
 * 指向同一份证据，"这一条到底核对过没有"就说不清了。
 */
export function normalizeUrl(value: string): string {
  if (!URL.canParse(value)) return value

  const url = new URL(value)
  url.hash = ''

  if (url.pathname !== '/') {
    url.pathname = url.pathname.replace(/\/$/, '')
  }

  return url.toString()
}

export function createRetrievalLedger(
  system: string,
  history: ChatCompletionMessageParam[],
): RetrievalLedger {
  return { system, intent: '', history, entries: [], sources: new Map() }
}

export function setLedgerIntent(ledger: RetrievalLedger, intent: string) {
  ledger.intent = intent
}

/** 循环自己写下的一条消息，目前只有带 tool_calls 的 assistant */
export function recordMessage(ledger: RetrievalLedger, message: ChatCompletionMessageParam) {
  ledger.entries.push({ kind: 'chat', message })
}

/**
 * 认领一个地址，拿到它这一次运行里的引用编号。
 *
 * 第一次见到就发一个新号，之后再见到同一个地址（另一次搜索又搜到、或者被 read_page
 * 读了正文）都复用它。标题和摘要只补空缺不覆盖：先到的那份通常来自搜索，
 * 比 read_page 结果里的地址更能说明这是什么页面。
 */
function claimSource(ledger: RetrievalLedger, url: string, title: string, snippet: string) {
  const key = normalizeUrl(url)
  const existing = ledger.sources.get(key)

  if (existing) {
    if (!existing.title && title) existing.title = title
    if (!existing.snippet && snippet) existing.snippet = snippet

    return existing
  }

  const record: EvidenceSource = {
    ref: ledger.sources.size + 1,
    // 存原始地址而不是归一化后的：界面上点开的应该是来源给出的那一个
    url,
    title,
    snippet,
    read: false,
  }

  ledger.sources.set(key, record)

  return record
}

function statusFields(status: RunStatus) {
  return {
    budget: { search: status.searchLeft, read_page: status.pageLeft },
    rounds_left: status.roundsLeft,
  }
}

function pushFixed(ledger: RetrievalLedger, toolCallId: string, content: string) {
  ledger.entries.push({ kind: 'fixed', toolCallId, content })
}

/** 模型偶尔发不合法的 JSON，读不出来就当没有参数 */
function readToolArguments(argumentsJson: string) {
  const parsed = parseJson(argumentsJson)

  return isRecord(parsed) ? parsed : undefined
}

function recordSearch(
  ledger: RetrievalLedger,
  toolCallId: string,
  results: unknown[],
  status: RunStatus,
): ToolResultView {
  const sources: ToolSource[] = []
  const claimed = new Set<number>()

  for (const result of results) {
    if (sources.length >= TOOL_SOURCE_MAX_COUNT) break
    if (!isRecord(result)) continue

    const url = readString(result, 'url')

    // 没有地址的一条既点不开也没法引用，留着只是占一个名额
    if (!url) continue

    const record = claimSource(
      ledger,
      url,
      condense(readString(result, 'title'), TOOL_SOURCE_TITLE_MAX_LENGTH),
      condense(readString(result, 'snippet'), TOOL_SOURCE_SNIPPET_MAX_LENGTH),
    )

    // 提供方偶尔在同一次搜索里重复给同一个地址；同一个编号不必上线两次
    if (claimed.has(record.ref)) continue

    claimed.add(record.ref)
    sources.push({ ref: record.ref, url: record.url, title: record.title, snippet: record.snippet })
  }

  pushFixed(
    ledger,
    toolCallId,
    JSON.stringify({ ok: true, count: sources.length, sources, ...statusFields(status) }),
  )

  if (results.length === 0) return { ok: true, preview: '没有命中' }

  // 标题是提供方给的，不一定有；条数才是"这一步拿回了什么"的下限
  const titles = results
    .map((result) => (isRecord(result) ? readString(result, 'title') : ''))
    .filter(Boolean)

  return {
    ok: true,
    preview: condense(
      titles.length > 0 ? `${results.length} 条 · ${titles.join(' · ')}` : `${results.length} 条`,
    ),
    ...(sources.length > 0 ? { sources } : {}),
  }
}

function recordPage(
  ledger: RetrievalLedger,
  toolCallId: string,
  result: Record<string, unknown>,
  requestedUrl: string,
  status: RunStatus,
): ToolResultView {
  const body = readString(result, 'content')
  const truncated = result.truncated === true
  const size = `${body.length} 字符${truncated ? '（截断）' : ''}`
  const preview = condense(`${size} · ${body}`)
  // 提供方跟完跳转后给回的地址才是真正读到的那一页；拿不到就退回请求时用的地址
  const url = readString(result, 'url') || requestedUrl

  if (!url) {
    pushFixed(
      ledger,
      toolCallId,
      JSON.stringify({
        ok: true,
        chars: body.length,
        truncated,
        content: body,
        ...statusFields(status),
      }),
    )

    return { ok: true, preview }
  }

  const record = claimSource(ledger, url, '', '')

  record.read = true
  record.chars = body.length

  ledger.entries.push({
    kind: 'page',
    toolCallId,
    ref: record.ref,
    url: record.url,
    body,
    truncated,
    status,
  })

  return { ok: true, preview }
}

function recordFailure(
  ledger: RetrievalLedger,
  toolCallId: string,
  parsed: Record<string, unknown>,
  status: RunStatus,
): ToolResultView {
  // 原样带上工具给的字段：invalid_tool_arguments 里那份 issues 是模型改对参数的唯一线索
  pushFixed(ledger, toolCallId, JSON.stringify({ ...parsed, ...statusFields(status) }))

  const error = readString(parsed, 'error') || 'unknown_error'
  const label = toolErrorPreview[error]

  if (label) return { ok: false, preview: label }

  const message = readString(parsed, 'message')

  return { ok: false, preview: condense(message ? `${error} · ${message}` : error) }
}

/**
 * 把一条工具结果记进账本，并返回界面要的那份摘要。
 *
 * 进上下文的内容由这里重写，不是把提供方的 JSON 原样推进去：搜索结果换成带引用编号
 * 的来源列表，正文单独存起来等着按预算投喂，每一条都补上"之后还剩多少额度"。
 * 界面拿到的则是另一套东西——一行人话摘要，加上裁剪过的来源。
 */
export function recordToolResult(
  ledger: RetrievalLedger,
  input: {
    toolCall: ChatCompletionMessageFunctionToolCall
    content: string
    status: RunStatus
  },
): ToolResultView {
  const { toolCall, content, status } = input
  const parsed = parseJson(content)

  // 认不出的形状原样留着：宁可多喂几个字符，也不要悄悄丢掉工具说过的话
  if (!isRecord(parsed)) {
    pushFixed(ledger, toolCall.id, content)

    return { ok: false }
  }

  if (parsed.ok !== true) return recordFailure(ledger, toolCall.id, parsed, status)

  if (Array.isArray(parsed.results)) {
    return recordSearch(ledger, toolCall.id, parsed.results, status)
  }

  if (isRecord(parsed.result) && typeof parsed.result.content === 'string') {
    return recordPage(
      ledger,
      toolCall.id,
      parsed.result,
      readString(readToolArguments(toolCall.function.arguments), 'url'),
      status,
    )
  }

  pushFixed(ledger, toolCall.id, JSON.stringify({ ...parsed, ...statusFields(status) }))

  return { ok: true }
}

/**
 * 这一次投喂里哪些页面给全文。
 *
 * 从最近读的一页往前给：新读回来的那一页正是模型此刻在核对的东西，而几轮前那一页
 * 该记住的结论它已经写进正文了。放不下的跳过而不是就此收手——大页面后面跟着的
 * 小页面还塞得进去，逐条判断得到的结果也和"账本长什么样"一一对应，可以直接断言。
 */
function readFullBodyPages(entries: LedgerEntry[]) {
  const full = new Set<PageEntry>()
  let remaining = agentLimits.maxPageContextLength

  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]

    if (entry?.kind !== 'page') continue
    if (entry.body.length > remaining) continue

    remaining -= entry.body.length
    full.add(entry)
  }

  return full
}

function renderPage(entry: PageEntry, full: boolean) {
  if (full) {
    return JSON.stringify({
      ok: true,
      ref: entry.ref,
      url: entry.url,
      chars: entry.body.length,
      truncated: entry.truncated,
      content: entry.body,
      ...statusFields(entry.status),
    })
  }

  return JSON.stringify({
    ok: true,
    ref: entry.ref,
    url: entry.url,
    chars: entry.body.length,
    excerpt: entry.body.slice(0, agentLimits.pageExcerptLength),
    note: 'Body removed from context to stay within the page budget; only the opening excerpt is left. Do not read this url again — rely on the conclusion you already wrote about it.',
    ...statusFields(entry.status),
  })
}

/**
 * 把账本投影成这一轮真正发给模型的消息列表。
 *
 * 纯函数：同一个账本永远投出同一份上下文，所以"预算生效之后模型看到了什么"
 * 是可以直接断言的。检索意图并进第一条 system 消息，而不是另起一条——
 * 它就是这一次运行的行为约束的一部分，不该让协议里多出一种消息排布。
 */
export function projectContext(ledger: RetrievalLedger): ChatCompletionMessageParam[] {
  const full = readFullBodyPages(ledger.entries)
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: ledger.intent ? `${ledger.system}\n\n${ledger.intent}` : ledger.system,
    },
    ...ledger.history,
  ]

  for (const entry of ledger.entries) {
    if (entry.kind === 'chat') {
      messages.push(entry.message)
      continue
    }

    messages.push({
      role: 'tool',
      tool_call_id: entry.toolCallId,
      content: entry.kind === 'page' ? renderPage(entry, full.has(entry)) : entry.content,
    })
  }

  return messages
}

/**
 * 这一次运行认领过的全部来源，按引用编号排好。
 *
 * 返回副本：账本里的记录还会被后面的轮次改（同一个地址被读了正文就要翻成 read），
 * 把内部对象直接交出去，客户端事件里的东西就会跟着变。
 */
export function ledgerEvidence(ledger: RetrievalLedger): EvidenceSource[] {
  return [...ledger.sources.values()].map((source) => ({ ...source }))
}

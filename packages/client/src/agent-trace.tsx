import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ToolSource } from '@ai-agent-pro/shared/type.js'
import {
  AgentLoopIcon,
  ConfirmedIcon,
  DisclosureIcon,
  ReadPageIcon,
  ReasoningIcon,
  SearchWebIcon,
  ThinkingIcon,
  ToolIcon,
  UnmetIcon,
  vars,
} from './icons'
import { readHost, readHostHue } from './util'
import './agent-trace.css'

/** 一次工具调用在界面上的样子。ok 还是 undefined 表示结果没回来 */
export type ToolCallView = {
  id: string
  name: string
  arguments: string
  ok?: boolean
  /** 服务端提炼的一行结果摘要 */
  preview?: string
  /** search 搜到的来源，服务端已裁剪 */
  sources?: ToolSource[]
}

/**
 * 一轮循环留下的痕迹。
 *
 * 服务端的 round_start 把过程话术和最终答案切开：带工具调用的轮次是过程，
 * 最后那个不带工具调用的轮次才是答案。
 */
export type TraceRound = {
  round: number
  /** 这一轮的思维链 */
  reasoning: string
  text: string
  toolCalls: ToolCallView[]
  startedAt: number
}

/** 这一轮的 text 是过程话术，还是最终答案？只有带工具调用的轮次是过程 */
export function isProcessRound(round: TraceRound) {
  return round.toolCalls.length > 0
}

function readToolIcon(name: string) {
  if (name === 'search') return SearchWebIcon
  if (name === 'read_page') return ReadPageIcon

  return ToolIcon
}

function readToolLabel(name: string) {
  if (name === 'search') return '搜索'
  if (name === 'read_page') return '读取页面'

  return name
}

/** 模型偶尔发不合法的 JSON，读不出来就当没有参数 */
function readToolArguments(argumentsJson: string) {
  try {
    const parsed: unknown = JSON.parse(argumentsJson)

    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

function readStringField(source: Record<string, unknown> | undefined, key: string) {
  const value = source?.[key]

  return typeof value === 'string' ? value : undefined
}

/** 参数里最能说明"在查什么"的那一项；读不出来就把原始参数摆出来 */
function readToolDetail(toolCall: ToolCallView) {
  const args = readToolArguments(toolCall.arguments)

  return readStringField(args, 'query') ?? readStringField(args, 'url') ?? toolCall.arguments
}

/**
 * 这一次运行里被 read_page 读过的地址。
 *
 * 有了它，搜索结果上才能标出"哪一条真的被读了正文"——搜到、挑中、读回来
 * 本来是一条链，界面上不接起来的话，每次搜索看着都像各自孤立的一步。
 */
function readVisitedUrls(rounds: TraceRound[]) {
  const visited = new Set<string>()

  for (const round of rounds) {
    for (const toolCall of round.toolCalls) {
      if (toolCall.name !== 'read_page') continue

      const url = readStringField(readToolArguments(toolCall.arguments), 'url')

      if (url) visited.add(url)
    }
  }

  return visited
}

function readToolState(toolCall: ToolCallView) {
  if (toolCall.ok === undefined) return 'pending'

  return toolCall.ok ? 'ok' : 'failed'
}

/** 秒以下的差别没人分辨得出，但"3.4s 还是 12s"决定了下次还愿不愿意等 */
function formatElapsed(milliseconds: number) {
  if (milliseconds < 950) return `${(milliseconds / 1000).toFixed(1)}s`

  return `${Math.round(milliseconds / 100) / 10}s`
}

type ThinkingPanelProps = {
  reasoning: string
  /** 这一轮还在跑：默认展开，并且跟着新内容往下滚 */
  live: boolean
}

/**
 * 思维链面板
 *
 * 进行中默认展开——用户要的就是"现在在想什么"；这一轮一结束就自动收起，
 * 因为高推理档下一轮能想出几千字，三轮铺开会把答案顶到屏幕外面去。
 * 手动开关过之后不再自动收起：那说明他想读完。
 */
function ThinkingPanel({ reasoning, live }: ThinkingPanelProps) {
  const textRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(false)
  const [open, setOpen] = useState(live)

  useEffect(() => {
    if (!live && !pinnedRef.current) setOpen(false)
  }, [live])

  /**
   * 滚到底要在绘制之前完成，否则每来一段都会先闪一帧旧位置。
   * scrollable 直接写 DOM 属性而不是进 state：这个效应每帧都跑，
   * 走 setState 就等于把流式期间的渲染次数翻倍，而它只影响一层遮罩。
   */
  useLayoutEffect(() => {
    const text = textRef.current

    if (!text) return

    text.dataset.scrollable = String(text.scrollHeight > text.clientHeight + 1)

    // 只有还在跑的轮次跟着滚；已结束的轮次展开后应该停在开头，让人从头读
    if (live && open) text.scrollTop = text.scrollHeight
  }, [reasoning, live, open])

  if (!reasoning) return null

  return (
    <div className="trace-think" data-open={open}>
      <button
        type="button"
        className="trace-think-toggle"
        aria-expanded={open}
        onClick={() => {
          pinnedRef.current = true
          setOpen((current) => !current)
        }}
      >
        <ReasoningIcon size={13} />
        <span>{live ? '思考中' : '思考过程'}</span>
        <span className="trace-think-count">{reasoning.length} 字</span>
        <DisclosureIcon size={13} play="none" className="trace-think-chevron" />
      </button>
      <div className="trace-think-body">
        <div className="trace-clip">
          <div className="trace-think-text" ref={textRef} data-live={live}>
            {reasoning}
          </div>
        </div>
      </div>
    </div>
  )
}

const toolStateLabel = {
  pending: '进行中',
  ok: '成功',
  failed: '失败',
} as const

type ToolSourceListProps = {
  sources: ToolSource[]
  /** 这一次运行里被读过正文的地址 */
  visitedUrls: Set<string>
}

/**
 * 一次搜索拿回的来源。
 *
 * 编号 + 域名 + 标题 + 一句摘要，是"要不要点进去"这个判断需要的全部信息；
 * 摘要压成两行，因为提供方给的那段话经常是从正文中间截下来的，读完也不会更清楚。
 *
 * 编号用服务端发的 ref，不用列表下标：同一个地址会在多次搜索里重复出现，
 * 下标每次都不一样，而答案里的 [2] 指的是 ref。两边不一致的话，
 * 用户顺着编号找过来会落到另一条来源上。
 */
function ToolSourceList({ sources, visitedUrls }: ToolSourceListProps) {
  return (
    <ol className="trace-sources">
      {sources.map((source, index) => {
        const host = readHost(source.url)

        return (
          <li
            className="trace-source"
            key={source.ref}
            style={vars({ '--i': index, '--hue': readHostHue(host) })}
          >
            <span className="trace-source-mark" aria-hidden="true">
              {source.ref}
            </span>
            <div className="trace-source-body">
              <div className="trace-source-line">
                <span className="trace-source-host">{host}</span>
                {visitedUrls.has(source.url) ? (
                  <span className="trace-source-read">已读取</span>
                ) : null}
              </div>
              <a
                className="trace-source-title"
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                {source.title || source.url}
              </a>
              {source.snippet ? <p className="trace-source-snippet">{source.snippet}</p> : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

type ToolCallRowProps = {
  toolCall: ToolCallView
  /** 决定出场顺序：同一轮里的并发调用依次亮起，而不是一起砸下来 */
  index: number
  visitedUrls: Set<string>
}

/**
 * 一次工具调用
 *
 * 收起时只有一行——工具名 + 在查什么 + 状态，这是扫一眼就要看懂的部分。
 * 展开才给参数和搜到的来源：想核对"它到底搜了什么词、看的是哪些站"的人才会点。
 */
function ToolCallRow({ toolCall, index, visitedUrls }: ToolCallRowProps) {
  const [open, setOpen] = useState(false)
  const ToolCallIcon = readToolIcon(toolCall.name)
  const state = readToolState(toolCall)
  const sources = toolCall.sources ?? []

  return (
    <li className="trace-tool" data-open={open} style={vars({ '--i': index })}>
      <button
        type="button"
        className="trace-tool-row"
        data-state={state}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <ToolCallIcon size={15} />
        <span className="trace-tool-name">{readToolLabel(toolCall.name)}</span>
        <span className="trace-tool-detail">{readToolDetail(toolCall)}</span>
        {sources.length > 0 ? <span className="trace-tool-count">{sources.length} 条</span> : null}
        <span className="trace-tool-status">
          {state === 'pending' ? <ThinkingIcon size={14} /> : null}
          {state === 'ok' ? <ConfirmedIcon size={14} play="once" /> : null}
          {state === 'failed' ? <UnmetIcon size={14} play="once" /> : null}
          <span className="sr-only">{toolStateLabel[state]}</span>
        </span>
      </button>
      <div className="trace-tool-body">
        {/* 收起时里面的链接不该还能被 Tab 走到——它在视觉上已经不存在了 */}
        <div className="trace-clip" inert={!open}>
          <dl className="trace-tool-fields">
            <dt>参数</dt>
            <dd>{toolCall.arguments || '（空）'}</dd>
            {/* 有来源列表时这一行就是多余的：条数在标题上，标题在列表里 */}
            {toolCall.preview === undefined || sources.length > 0 ? null : (
              <>
                <dt>结果</dt>
                <dd>{toolCall.preview}</dd>
              </>
            )}
          </dl>
          {sources.length > 0 ? (
            <ToolSourceList sources={sources} visitedUrls={visitedUrls} />
          ) : null}
        </div>
      </div>
    </li>
  )
}

type TraceRoundItemProps = {
  round: TraceRound
  /** 这一轮就是当前在跑的那一轮 */
  live: boolean
  /** 这一轮结束的时刻：下一轮的开始时间，或者整条消息的结束时间 */
  endedAt?: number
  visitedUrls: Set<string>
}

/** 循环里的一轮：左边一条竖轨串起所有轮次，进行中的那一段有电流在流 */
function TraceRoundItem({ round, live, endedAt, visitedUrls }: TraceRoundItemProps) {
  const elapsed = endedAt === undefined ? undefined : endedAt - round.startedAt

  return (
    <li className="trace-round" data-state={live ? 'active' : 'done'}>
      <span className="trace-dot" aria-hidden="true" />
      <div className="trace-round-head">
        <span>第 {round.round} 轮</span>
        <span className="trace-elapsed">
          {elapsed === undefined ? '进行中' : formatElapsed(elapsed)}
        </span>
      </div>
      <ThinkingPanel reasoning={round.reasoning} live={live} />
      {isProcessRound(round) && round.text ? <p className="trace-say">{round.text}</p> : null}
      {round.toolCalls.length > 0 ? (
        <ul className="trace-tools">
          {round.toolCalls.map((toolCall, index) => (
            <ToolCallRow
              key={toolCall.id}
              toolCall={toolCall}
              index={index}
              visitedUrls={visitedUrls}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

type AgentTraceProps = {
  rounds: TraceRound[]
  /** 这条消息还在生成 */
  live: boolean
  /** 生成结束的时刻，用来给最后一轮结算耗时 */
  finishedAt?: number
}

/**
 * 检索过程
 *
 * memo 在这里不是微优化：思维链每一帧都在长，而输入框每敲一个字也会重渲染整个页面。
 * 把这棵子树隔开，两边就互相不影响。
 */
export const AgentTrace = memo(function AgentTrace({ rounds, live, finishedAt }: AgentTraceProps) {
  const [open, setOpen] = useState(true)

  /*
   * 先按完整序列结算每一轮的时间，再筛掉没留下痕迹的轮次。
   * 顺序反过来的话，被筛掉那一轮的耗时会被算到前一轮头上。
   */
  const items = rounds
    .map((round, index) => ({
      round,
      live: live && index === rounds.length - 1,
      endedAt: index === rounds.length - 1 ? finishedAt : rounds[index + 1]?.startedAt,
    }))
    .filter((item) => item.round.toolCalls.length > 0 || item.round.reasoning)

  if (items.length === 0) return null

  const toolCount = items.reduce((total, item) => total + item.round.toolCalls.length, 0)
  // 跨轮次匹配，所以只能在这里算：读页面往往发生在搜索的下一轮
  const visitedUrls = readVisitedUrls(rounds)

  return (
    <section className="trace" data-open={open}>
      <button
        type="button"
        className="trace-head"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {live ? (
          <span className="trace-live-dot" aria-hidden="true" />
        ) : (
          <AgentLoopIcon size={15} play="none" />
        )}
        <span className="trace-head-title">检索过程</span>
        <span className="trace-head-meta">
          {items.length} 轮 · {toolCount} 次调用
        </span>
        <DisclosureIcon size={15} play="none" className="trace-head-chevron" />
      </button>
      <div className="trace-body">
        <div className="trace-clip" inert={!open}>
          <ol className="trace-rounds" aria-label="检索过程">
            {items.map((item) => (
              <TraceRoundItem
                key={item.round.round}
                round={item.round}
                live={item.live}
                endedAt={item.endedAt}
                visitedUrls={visitedUrls}
              />
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
})

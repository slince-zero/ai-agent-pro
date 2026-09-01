import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
import './agent-trace.css'

/** 一次工具调用在界面上的样子。ok 还是 undefined 表示结果没回来 */
export type ToolCallView = {
  id: string
  name: string
  arguments: string
  ok?: boolean
  /** 服务端提炼的一行结果摘要 */
  preview?: string
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

/** 参数里最能说明"在查什么"的那一项；模型偶尔发不合法的 JSON，那就原样显示 */
function readToolDetail(toolCall: ToolCallView) {
  try {
    const parsed = JSON.parse(toolCall.arguments) as { query?: unknown; url?: unknown }
    const detail = parsed.query ?? parsed.url

    return typeof detail === 'string' ? detail : toolCall.arguments
  } catch {
    return toolCall.arguments
  }
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

type ToolCallRowProps = {
  toolCall: ToolCallView
  /** 决定出场顺序：同一轮里的并发调用依次亮起，而不是一起砸下来 */
  index: number
}

/**
 * 一次工具调用
 *
 * 收起时只有一行——工具名 + 在查什么 + 状态，这是扫一眼就要看懂的部分。
 * 展开才给完整参数和结果摘要：想核对"它到底搜了什么词"的人才会点。
 */
function ToolCallRow({ toolCall, index }: ToolCallRowProps) {
  const [open, setOpen] = useState(false)
  const ToolCallIcon = readToolIcon(toolCall.name)
  const state = readToolState(toolCall)

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
        <span className="trace-tool-status">
          {state === 'pending' ? <ThinkingIcon size={14} /> : null}
          {state === 'ok' ? <ConfirmedIcon size={14} play="once" /> : null}
          {state === 'failed' ? <UnmetIcon size={14} play="once" /> : null}
          <span className="sr-only">{toolStateLabel[state]}</span>
        </span>
      </button>
      <div className="trace-tool-body">
        <div className="trace-clip">
          <dl className="trace-tool-fields">
            <dt>参数</dt>
            <dd>{toolCall.arguments || '（空）'}</dd>
            {toolCall.preview === undefined ? null : (
              <>
                <dt>结果</dt>
                <dd>{toolCall.preview}</dd>
              </>
            )}
          </dl>
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
}

/** 循环里的一轮：左边一条竖轨串起所有轮次，进行中的那一段有电流在流 */
function TraceRoundItem({ round, live, endedAt }: TraceRoundItemProps) {
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
            <ToolCallRow key={toolCall.id} toolCall={toolCall} index={index} />
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
        <div className="trace-clip">
          <ol className="trace-rounds" aria-label="检索过程">
            {items.map((item) => (
              <TraceRoundItem
                key={item.round.round}
                round={item.round}
                live={item.live}
                endedAt={item.endedAt}
              />
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
})

import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, UIEvent } from 'react'
import type { ChatMessage as RequestMessage, TokenUsage } from '@ai-agent-pro/shared/type.js'
import {
  AccountIcon,
  AttachIcon,
  ConfirmedIcon,
  ConnectorArt,
  ContextAvatar,
  ContextLogo,
  CopyIcon,
  HistoryIcon,
  NewChatIcon,
  QueryIcon,
  RerankIcon,
  SendIcon,
  SparkIcon,
  StopIcon,
  ThinkingIcon,
  TokensIcon,
  UnmetIcon,
} from './icons'
import { AgentTrace, type TraceRound } from './agent-trace'
import { AssistantMarkdown } from './markdown'
import { PetCompanion } from './pet'
import { consumeNDJSON } from './util'

type ChatMessage = RequestMessage & {
  usage?: TokenUsage
  cancelled?: boolean
  trace?: TraceRound[]
  /** 这条回答停下来的时刻，用来给最后一轮结算耗时 */
  finishedAt?: number
}

/**
 * 还没显示出来的文字。
 *
 * 按轮次分段是因为轮次边界一到，积压就会被记到下一轮名下；再按 channel 分段是因为
 * 思维链和正文是两条流，混在一起吐会把推理写进答案里。
 */
type PendingChunk = {
  round: number
  channel: 'reasoning' | 'text'
  text: string
}

/**
 * 问答界面的交互状态
 * - idle：初始空闲状态，等待用户输入
 * - loading：请求已发出，等待服务端响应首字节
 * - streaming：正在接收流式数据，逐字渲染中
 * - success：流式接收完成，问答结束
 * - error：请求失败，展示错误提示
 */
type UIStatus = 'idle' | 'loading' | 'streaming' | 'success' | 'error'

/** system prompt 归服务端所有：它是行为约束，不能是客户端可以改写的东西 */
const initialMessages: ChatMessage[] = []

const examplePrompts = [
  { label: '找一篇 TypeScript 入门教程', icon: QueryIcon },
  { label: '比较三个 Agent 方案', icon: RerankIcon },
  { label: '介绍下自己', icon: ConfirmedIcon },
]

const focusRing =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-[#f05a2a]/30 focus-visible:outline-offset-[3px]'

/**
 * 流式文字的显示节奏
 *
 * 一次给多少字完全由模型和网络决定：安静三百毫秒，然后甩过来四十个字。
 * 照原样渲染，屏幕上就是一段一段地跳。
 * 所以收到的文字先进积压区，再由 revealFrame 每帧匀速吐出来——
 * 网络的抖动被这层缓冲吸收掉，眼睛看到的是一条连续的字流。
 */
/** 目标：用这么长时间把当前积压吐完。太短会跟着网络一起抖，太长则明显落后于模型 */
const REVEAL_WINDOW_MS = 260
/** 切到别的标签页再回来时，rAF 会隔很久才给一帧；钳住时间差，否则会一次糊上来一大段 */
const MAX_FRAME_GAP_MS = 100

/** UTF-16 代理对的前一半（0xD800–0xDBFF），后面必须再跟一个才是一个完整字符 */
function isHighSurrogate(code: number) {
  return code >= 0xd800 && code <= 0xdbff
}

function updateLastAssistant(
  messages: ChatMessage[],
  update: (message: ChatMessage) => ChatMessage,
): ChatMessage[] {
  const lastIndex = messages.length - 1
  const lastMessage = messages[lastIndex]

  if (lastMessage?.role !== 'assistant') return messages

  const nextMessages = [...messages]
  nextMessages[lastIndex] = update(lastMessage)

  return nextMessages
}

/** 找到（或补上）某一轮的记录。轮次事件按序到达，所以直接追加就是正确顺序 */
function withRound(
  trace: TraceRound[] | undefined,
  round: number,
  update: (entry: TraceRound) => TraceRound,
): TraceRound[] {
  const rounds = trace ?? []
  const existing = rounds.find((entry) => entry.round === round)

  // startedAt 落在这里而不是 round_start 里，是为了让"补上"这条路径也有起点；
  // 正常情况下 round_start 先到，所以这个时刻就是这一轮真正的开始
  if (!existing) {
    return [
      ...rounds,
      update({ round, reasoning: '', text: '', toolCalls: [], startedAt: Date.now() }),
    ]
  }

  return rounds.map((entry) => (entry === existing ? update(existing) : entry))
}

/** tool_result 只带 id，不带轮次，所以直接按 id 全表找 */
function markToolResult(
  trace: TraceRound[] | undefined,
  id: string,
  ok: boolean,
  preview?: string,
): TraceRound[] {
  return (trace ?? []).map((entry) => ({
    ...entry,
    toolCalls: entry.toolCalls.map((toolCall) =>
      toolCall.id === id ? { ...toolCall, ok, preview } : toolCall,
    ),
  }))
}

/**
 * 收尾时把最后一轮搬进 content。
 *
 * 流式过程中答案还躺在 trace 里（谁是答案只有轮次结束才知道），收尾之后
 * content 就只装答案：复制、下一轮请求、回放历史看到的都该是答案本身。
 */
function promoteAnswer(message: ChatMessage): ChatMessage {
  const lastRound = message.trace?.at(-1)

  if (!lastRound || lastRound.toolCalls.length > 0) return message

  return {
    ...message,
    content: message.content + lastRound.text,
    // 正文搬走了，思维链留下：最后一轮"怎么想出这个答案的"和前几轮一样属于过程
    trace: message.trace?.map((entry) => (entry === lastRound ? { ...entry, text: '' } : entry)),
  }
}

/** 答案在收尾前后待的地方不一样，取值统一走这里 */
function readAnswer(message: ChatMessage) {
  if (message.content) return message.content

  const lastRound = message.trace?.at(-1)

  return lastRound && lastRound.toolCalls.length === 0 ? lastRound.text : ''
}

function hasRenderableContent(message: ChatMessage) {
  return Boolean(message.content) || (message.trace?.length ?? 0) > 0
}

function addUsage(total: TokenUsage | undefined, next: TokenUsage): TokenUsage {
  if (!total) return next

  // 每轮各报一次用量，覆盖只会显示最后一轮，看起来比真实成本便宜得多
  return {
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
    totalTokens: total.totalTokens + next.totalTokens,
  }
}

/** 消息下方的操作按钮：常显但压到最低对比度，hover 才变成品牌色 */
const messageAction =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent px-1.5 py-1 text-xs text-[#a8a59e] transition-colors hover:text-[#d4491f]'

function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return

  event.preventDefault()
  event.currentTarget.form?.requestSubmit()
}

export function App() {
  const fileInputId = useId()
  const messageEndRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const requestControllerRef = useRef<AbortController | null>(null)
  /** 用户是否贴在对话底部，决定新内容是否要自动滚动跟随 */
  const pinnedToBottomRef = useRef(true)
  /** 已经收到、但还没显示出来的文字；由 revealFrame 匀速吐给界面 */
  const pendingRef = useRef<PendingChunk[]>([])
  const revealFrameRef = useRef<number | null>(null)
  const lastRevealAtRef = useRef(0)
  /** 当前是第几轮：tool_call 事件不带轮次，得靠 round_start 记着 */
  const currentRoundRef = useRef(1)
  /** 流已经结束、积压还没吐完时的收尾动作 */
  const afterDrainRef = useRef<(() => void) | null>(null)
  const [question, setQuestion] = useState('')
  const [attachment, setAttachment] = useState('')
  const [status, setStatus] = useState<UIStatus>('idle')
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  /**
   * 没有内容的助手消息不渲染，否则只会留下一个孤零零的头像。
   * 它有两个来源：请求刚发出时的占位，以及请求失败后留下的空壳。
   * 失败的空壳不一定在末尾（用户可以接着发下一条），所以不能只判断末位。
   */
  const visibleConversation = messages.filter(
    (message) => message.role !== 'assistant' || hasRenderableContent(message),
  )
  const hasConversation = messages.length > 0
  const isBusy = status === 'loading' || status === 'streaming'

  /**
   * 只在用户本来就贴着底部时跟随滚动。
   * 否则流式输出期间，用户每次往上翻历史都会被新 token 拽回底部。
   * 生成中用 auto 而不是 smooth：一秒几十次平滑滚动既卡顿也晕。
   */
  useEffect(() => {
    if (!pinnedToBottomRef.current) return

    messageEndRef.current?.scrollIntoView({
      behavior: status === 'streaming' ? 'auto' : 'smooth',
      block: 'end',
    })
  }, [messages, status])

  /** 输入框跟随内容长高，超过 max-height 后才内部滚动 */
  useEffect(() => {
    const composer = composerRef.current

    if (!composer) return

    composer.style.height = 'auto'
    composer.style.height = `${composer.scrollHeight}px`
  }, [question])

  useEffect(() => () => cancelReveal(), [])

  function handleConversationScroll(event: UIEvent<HTMLDivElement>) {
    const area = event.currentTarget

    pinnedToBottomRef.current = area.scrollHeight - area.scrollTop - area.clientHeight < 80
  }

  /**
   * 把一段文字追加到最后一条助手消息的某一轮上。
   * 服务端每个 token 一个 NDJSON 事件，逐个 setState 会让 Markdown 每秒重新解析几十次，
   * 所以调用它的只有 revealFrame（每帧最多一次）和收尾时的 flushPendingText。
   */
  function appendRevealedText(chunk: PendingChunk, text: string) {
    setMessages((previousMessages) =>
      updateLastAssistant(previousMessages, (message) => ({
        ...message,
        trace: withRound(message.trace, chunk.round, (entry) =>
          chunk.channel === 'reasoning'
            ? { ...entry, reasoning: entry.reasoning + text }
            : { ...entry, text: entry.text + text },
        ),
      })),
    )
  }

  function cancelReveal() {
    if (revealFrameRef.current === null) return

    cancelAnimationFrame(revealFrameRef.current)
    revealFrameRef.current = null
  }

  /** 积压吐干了，才轮到流结束时预约的收尾 */
  function runAfterDrain() {
    const afterDrain = afterDrainRef.current

    afterDrainRef.current = null
    afterDrain?.()
  }

  function pendingLength() {
    return pendingRef.current.reduce((total, chunk) => total + chunk.text.length, 0)
  }

  /**
   * 一帧吐一小段：吐多少由积压量和这一帧的时长决定。
   * 积压越多吐得越快，所以模型突然加速时屏幕不会越拖越远；
   * 积压见底就停下来等下一批，不空转 rAF。
   */
  function revealFrame(timestamp: number) {
    revealFrameRef.current = null

    const frameGap = Math.min(timestamp - lastRevealAtRef.current, MAX_FRAME_GAP_MS)
    lastRevealAtRef.current = timestamp

    const chunk = pendingRef.current[0]

    if (!chunk) {
      runAfterDrain()
      return
    }

    // 节奏按总积压算，但一帧只从队首那一段里取字，免得跨过轮次或通道的边界记错账
    let count = Math.min(
      Math.max(1, Math.round((pendingLength() / REVEAL_WINDOW_MS) * frameGap)),
      chunk.text.length,
    )

    // emoji 这类字符由两个 code unit 组成，劈在中间会闪一帧乱码
    if (count < chunk.text.length && isHighSurrogate(chunk.text.charCodeAt(count - 1))) {
      count += 1
    }

    appendRevealedText(chunk, chunk.text.slice(0, count))
    chunk.text = chunk.text.slice(count)

    if (!chunk.text) pendingRef.current.shift()

    if (pendingRef.current.length > 0) {
      revealFrameRef.current = requestAnimationFrame(revealFrame)
      return
    }

    runAfterDrain()
  }

  function queuePendingText(chunk: Omit<PendingChunk, 'text'>, delta: string) {
    const lastChunk = pendingRef.current.at(-1)

    if (lastChunk?.round === chunk.round && lastChunk.channel === chunk.channel) {
      lastChunk.text += delta
    } else {
      pendingRef.current.push({ ...chunk, text: delta })
    }

    if (revealFrameRef.current !== null) return

    // 新一轮开始时把计时基准挪到当下，否则上一轮结束到现在的空档会被算成一帧
    lastRevealAtRef.current = performance.now()
    revealFrameRef.current = requestAnimationFrame(revealFrame)
  }

  /** 不再讲节奏，把积压一次性显示出来：出错时该立刻看到已经写出来的部分 */
  function flushPendingText() {
    cancelReveal()

    const pending = pendingRef.current

    pendingRef.current = []
    afterDrainRef.current = null

    for (const chunk of pending) {
      if (chunk.text) appendRevealedText(chunk, chunk.text)
    }
  }

  /** 流结束后等屏幕上的字追上来再收尾，否则光标会在文字还在出的时候就消失 */
  function settleAfterDrain(settle: () => void) {
    if (pendingRef.current.length === 0) {
      settle()
      return
    }

    afterDrainRef.current = settle
  }

  /** 请求之间要把节奏机器归零，否则上一轮的积压会吐到下一条消息上 */
  function resetReveal() {
    cancelReveal()
    pendingRef.current = []
    afterDrainRef.current = null
    currentRoundRef.current = 1
  }

  /** 时间轴要有终点：不盖上这个时刻，最后一轮会永远停在"进行中" */
  function finishTrace() {
    setMessages((previousMessages) =>
      updateLastAssistant(previousMessages, (message) => ({
        ...message,
        finishedAt: Date.now(),
      })),
    )
  }

  function cancelSubmit() {
    const cancelController = requestControllerRef.current

    if (!cancelController) return

    cancelController.abort()
    setStatus('idle')

    resetReveal()

    setMessages((prev) => {
      const lastMessage = prev.at(-1)

      if (lastMessage?.role !== 'assistant') {
        return prev
      }

      if (!hasRenderableContent(lastMessage)) {
        return prev.slice(0, -1)
      }

      const nextMessages = [...prev]
      nextMessages[nextMessages.length - 1] = {
        ...lastMessage,
        cancelled: true,
        finishedAt: Date.now(),
      }

      return nextMessages
    })
  }

  /** 新对话：中断进行中的请求，回到初始空状态 */
  function startNewChat() {
    requestControllerRef.current?.abort()
    requestControllerRef.current = null

    resetReveal()
    pinnedToBottomRef.current = true

    setMessages(initialMessages)
    setQuestion('')
    setAttachment('')
    setStatus('idle')
    setCopiedIndex(null)
    // 新对话之后光标就该在输入框里，省掉一次多余的点击
    composerRef.current?.focus()
  }

  async function copyMessage(content: string, index: number) {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedIndex(index)
      window.setTimeout(
        () => setCopiedIndex((current) => (current === index ? null : current)),
        1600,
      )
    } catch {
      /* 剪贴板被浏览器拒绝时保持静默，不打断阅读 */
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedQuestion = question.trim()
    if (!trimmedQuestion || isBusy) return

    setQuestion('')
    await runRequest([...messages, { role: 'user', content: trimmedQuestion }])
  }

  /** 重试：丢掉失败的那条回答，用同样的上下文再问一次 */
  async function retryLast() {
    if (isBusy) return

    const history = messages.at(-1)?.role === 'assistant' ? messages.slice(0, -1) : messages

    if (history.at(-1)?.role !== 'user') return

    await runRequest(history)
  }

  async function runRequest(nextMessages: ChatMessage[]) {
    const controller = new AbortController()
    requestControllerRef.current = controller

    pinnedToBottomRef.current = true
    resetReveal()

    setMessages([
      ...nextMessages,
      {
        role: 'assistant',
        content: '',
      },
    ])

    setStatus('loading')

    try {
      /**
       * 只把真正说过话的消息发给模型：
       * 被停止的那条内容不完整，失败留下的空壳则连角色都对不上（连续两个 user 会让模型困惑）。
       * trace 是本地视图，不上线——工具结果的账本只能由服务端自己写。
       */
      const requestMessages: RequestMessage[] = nextMessages
        .filter((message) => !message.cancelled && message.content)
        .map(({ role, content }) => ({
          role,
          content,
        }))
      const response = await fetch('/api/questions/stream', {
        method: 'post',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: requestMessages,
        }),
      })

      await consumeNDJSON(response, (e) => {
        if (controller.signal.aborted) return

        if (e.type === 'round_start') {
          currentRoundRef.current = e.round

          // 轮次一开始就把这一轮建出来：时间轴要立刻出现"第 N 轮 · 进行中"，
          // 而且 startedAt 只有此刻才是准的——等第一个 delta 到已经晚了几百毫秒
          setMessages((previousMessages) =>
            updateLastAssistant(previousMessages, (message) => ({
              ...message,
              trace: withRound(message.trace, e.round, (entry) => entry),
            })),
          )
        }

        if (e.type === 'reasoning_delta') {
          setStatus('streaming')
          queuePendingText({ round: currentRoundRef.current, channel: 'reasoning' }, e.delta)
        }

        if (e.type === 'text_delta') {
          setStatus('streaming')
          queuePendingText({ round: currentRoundRef.current, channel: 'text' }, e.delta)
        }

        if (e.type === 'tool_call') {
          setMessages((previousMessages) =>
            updateLastAssistant(previousMessages, (message) => ({
              ...message,
              trace: withRound(message.trace, currentRoundRef.current, (entry) => ({
                ...entry,
                toolCalls: [...entry.toolCalls, { id: e.id, name: e.name, arguments: e.arguments }],
              })),
            })),
          )
        }

        if (e.type === 'tool_result') {
          setMessages((previousMessages) =>
            updateLastAssistant(previousMessages, (message) => ({
              ...message,
              trace: markToolResult(message.trace, e.id, e.ok, e.preview),
            })),
          )
        }

        if (e.type === 'usage') {
          setMessages((previousMessages) =>
            updateLastAssistant(previousMessages, (message) => ({
              ...message,
              usage: addUsage(message.usage, e.usage),
            })),
          )
        }

        if (e.type === 'done') {
          settleAfterDrain(() => {
            setMessages((previousMessages) =>
              updateLastAssistant(previousMessages, (message) =>
                promoteAnswer({ ...message, finishedAt: Date.now() }),
              ),
            )
            setStatus('success')
          })
        }

        if (e.type === 'error') {
          flushPendingText()
          finishTrace()
          setStatus('error')
        }
      })
    } catch {
      if (!controller.signal.aborted) {
        flushPendingText()
        finishTrace()
        setStatus('error')
      }
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null
      }
    }
  }

  return (
    <div className="paper-grid flex h-svh min-w-[320px] flex-col overflow-hidden font-sans text-[#1f1f1f] antialiased">
      <header className="relative z-30 shrink-0 border-b border-[#deddd7] bg-[#faf9f5]/95 backdrop-blur-sm">
        {/* 880 - 2×20 的内距正好是 840：让 logo 和右侧动作跟输入框、消息列同一根竖线 */}
        <div className="mx-auto flex h-16 w-full max-w-[880px] items-center justify-between px-5 max-[640px]:px-4">
          <a
            className={`${focusRing} rounded-lg text-[#1f1f1f] no-underline`}
            href="/"
            aria-label="回到 Context 首页"
          >
            <ContextLogo size={26} />
          </a>

          <nav className="flex items-center gap-1.5" aria-label="会话操作">
            <button
              type="button"
              className={`${focusRing} inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border-0 bg-transparent px-3 text-sm font-semibold text-[#34332f] transition-colors hover:bg-[#f0ede6] hover:text-[#f05a2a]`}
              aria-label="新对话"
              onClick={startNewChat}
            >
              <NewChatIcon size={19} />
              <span className="max-[520px]:hidden">新对话</span>
            </button>
            <button
              type="button"
              className={`${focusRing} inline-flex h-10 items-center gap-2 rounded-xl border-0 bg-transparent px-3 text-sm font-semibold text-[#a8a59e] disabled:cursor-not-allowed`}
              disabled
              title="历史记录即将支持"
              aria-label="历史记录（即将支持）"
            >
              <HistoryIcon size={19} play="none" />
              <span className="max-[640px]:hidden">历史记录</span>
            </button>
            <button
              type="button"
              className={`${focusRing} grid size-10 place-items-center rounded-xl border-0 bg-transparent p-0 text-[#a8a59e] disabled:cursor-not-allowed`}
              disabled
              title="账户即将支持"
              aria-label="账户（即将支持）"
            >
              <AccountIcon size={23} play="none" />
            </button>
          </nav>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col" id="main-content">
        {/*
          滚到底的正文靠遮罩淡出，而不是在输入框那一层压一块底色。
          底色会把纸纹网格一起盖掉，输入框左右两侧于是空出一段没有格子的白；
          遮罩只吃内容自己的透明度，网格由背后的根节点绘制，因此一路通到底边。
        */}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,#000_calc(100%_-_40px),transparent)] [-webkit-mask-image:linear-gradient(to_bottom,#000_calc(100%_-_40px),transparent)]"
          onScroll={handleConversationScroll}
        >
          {hasConversation ? (
            <section
              className="mx-auto flex w-[calc(100%_-_40px)] max-w-[840px] flex-col gap-8 py-9 max-[640px]:w-[calc(100%_-_28px)] max-[640px]:gap-7 max-[640px]:py-6"
              aria-label="对话内容"
            >
              {visibleConversation.map((message, index) => {
                if (message.role === 'user') {
                  return (
                    <article className="flex justify-end" key={`${message.role}-${index}`}>
                      <div className="max-w-[78%] rounded-[22px_22px_7px_22px] bg-[#eeeae2] px-5 py-3.5 text-[16px] leading-7 text-[#292824] max-[640px]:max-w-[88%] max-[640px]:px-4 max-[640px]:py-3">
                        {message.content}
                      </div>
                    </article>
                  )
                }

                const isStreamingMessage =
                  status === 'streaming' && index === visibleConversation.length - 1
                const answer = readAnswer(message)

                return (
                  <article
                    className="grid grid-cols-[36px_minmax(0,1fr)] items-start gap-4 max-[640px]:grid-cols-[32px_minmax(0,1fr)] max-[640px]:gap-3"
                    key={`${message.role}-${index}`}
                  >
                    <div className="grid size-9 place-items-center rounded-xl border border-[#f05a2a]/25 bg-[#fff7f2] text-[#e34f22] max-[640px]:size-8">
                      <ContextAvatar size={20} />
                    </div>
                    <div className="min-w-0 pt-1">
                      <AgentTrace
                        rounds={message.trace ?? []}
                        live={isStreamingMessage}
                        finishedAt={message.finishedAt}
                      />
                      <div
                        className={
                          isStreamingMessage ? 'assistant-prose stream-caret' : 'assistant-prose'
                        }
                      >
                        <AssistantMarkdown content={answer} streaming={isStreamingMessage} />
                      </div>
                      {message.cancelled ? (
                        <p className="mt-3 mb-0 text-xs leading-5 text-[#8a8881]">已停止生成</p>
                      ) : null}
                      {!isBusy && hasRenderableContent(message) ? (
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                          <button
                            type="button"
                            className={`${focusRing} ${messageAction}`}
                            onClick={() => copyMessage(answer, index)}
                            aria-label={copiedIndex === index ? '已复制回答' : '复制回答'}
                          >
                            {copiedIndex === index ? (
                              <ConfirmedIcon size={15} play="once" />
                            ) : (
                              <CopyIcon size={15} />
                            )}
                            <span>{copiedIndex === index ? '已复制' : '复制'}</span>
                          </button>
                          {message.usage ? (
                            <span className="inline-flex items-center gap-1.5 text-xs leading-5 text-[#8a8881]">
                              <TokensIcon size={15} />
                              输入 {message.usage.inputTokens} · 输出 {message.usage.outputTokens} ·
                              共 {message.usage.totalTokens} tokens
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </article>
                )
              })}

              {status === 'loading' ? (
                <div
                  className="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-4 text-sm text-[#77746d] max-[640px]:grid-cols-[32px_minmax(0,1fr)] max-[640px]:gap-3"
                  role="status"
                  aria-live="polite"
                >
                  <div className="grid size-9 place-items-center rounded-xl border border-[#f05a2a]/20 bg-[#fff7f2] text-[#e34f22] max-[640px]:size-8">
                    <ThinkingIcon size={20} />
                  </div>
                  <span>正在整理答案…</span>
                </div>
              ) : null}
              <div ref={messageEndRef} />
            </section>
          ) : (
            <section className="relative mx-auto flex min-h-full w-full max-w-[980px] flex-col items-center justify-center overflow-hidden px-6 py-14 text-center max-[640px]:justify-start max-[640px]:px-5 max-[640px]:pt-[16vh]">
              <ConnectorArt className="pointer-events-none absolute top-[62.5%] left-1/2 z-0 w-[min(1120px,118vw)] max-w-none -translate-x-1/2 -translate-y-[46%] select-none opacity-70 max-[640px]:top-[43%] max-[640px]:w-[170vw] max-[640px]:opacity-50" />
              <div className="relative z-10">
                <div className="mx-auto mb-5 grid size-11 place-items-center rounded-2xl border border-[#f05a2a]/25 bg-[#fff7f2] text-[#e34f22] shadow-[0_10px_28px_rgba(77,58,47,0.08)]">
                  <SparkIcon size={24} play="once" />
                </div>
                <h1 className="m-0 text-[clamp(42px,5vw,64px)] leading-[1.08] font-black tracking-[-1.2px] text-[#1f1f1f] max-[640px]:text-[clamp(36px,10.8vw,44px)] max-[640px]:tracking-[-0.8px]">
                  今天想探索什么？
                </h1>
                <p className="mx-auto mt-5 mb-0 max-w-[560px] text-[17px] leading-7 text-[#5c5a54] max-[640px]:mt-4 max-[640px]:text-[15px]">
                  从一个问题开始，我会沿着上下文陪你继续追问。
                </p>
              </div>

              <div
                className="relative z-10 mt-9 flex flex-wrap justify-center divide-x divide-[#deddd7] max-[700px]:max-w-[360px] max-[700px]:divide-x-0"
                aria-label="示例问题"
              >
                {examplePrompts.map(({ label, icon: PromptIcon }) => (
                  <button
                    className={`${focusRing} inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent px-5 py-2.5 text-sm font-medium text-[#dd4f24] transition-colors hover:text-[#a93412] max-[700px]:w-full max-[700px]:justify-center`}
                    key={label}
                    type="button"
                    onClick={() => {
                      setQuestion(label)
                      // 只填进输入框不给焦点的话，用户点完示例还得自己再点一次输入框
                      composerRef.current?.focus()
                    }}
                  >
                    <PromptIcon size={18} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <section className="relative z-20 shrink-0 px-5 pt-3 pb-4 max-[640px]:px-3 max-[640px]:pb-3">
          <div className="mx-auto max-w-[840px]">
            <PetCompanion busy={isBusy} />

            <form
              className="group overflow-hidden rounded-[26px] border border-[#b9b8b3] bg-white/85 shadow-[0_12px_36px_rgba(58,50,43,0.1)] transition-[border-color,box-shadow] duration-150 focus-within:border-[#8f8e89] focus-within:shadow-[0_12px_38px_rgba(58,50,43,0.13),0_0_0_4px_rgba(240,90,42,0.07)]"
              onSubmit={handleSubmit}
            >
              <label className="sr-only" htmlFor="question">
                输入消息
              </label>
              <textarea
                className="block max-h-40 min-h-[58px] w-full resize-none border-0 bg-transparent px-5 pt-4 pb-2 text-[16px] leading-6 text-[#22211e] outline-none placeholder:text-[#96938c] max-[640px]:px-4"
                id="question"
                ref={composerRef}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="给 Context 发消息"
                rows={1}
              />

              <div className="flex items-center justify-between gap-3 px-2.5 pb-2.5 pl-3.5">
                <div className="flex min-w-0 items-center gap-2">
                  <input
                    id={fileInputId}
                    className="peer sr-only"
                    type="file"
                    onChange={(event) => setAttachment(event.target.files?.[0]?.name ?? '')}
                  />
                  <label
                    className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full text-[#5a5852] transition-colors hover:bg-[#f0ede6] hover:text-[#e34f22] peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-[#f05a2a]/30 peer-focus-visible:outline-offset-2"
                    htmlFor={fileInputId}
                    title="附加文件"
                  >
                    <AttachIcon size={20} />
                    <span className="sr-only">附加文件</span>
                  </label>
                  {attachment ? (
                    <span className="max-w-[260px] truncate text-xs text-[#77746d] max-[640px]:max-w-[140px]">
                      {attachment}
                    </span>
                  ) : (
                    // 用过一次就不用再看了：只在输入框获得焦点时淡入。
                    // 用 opacity 而不是 display，隐藏时照样占位，出现的瞬间不会推动旁边的图标。
                    <span className="text-xs text-[#8a8881] opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 max-[520px]:hidden">
                      Enter 发送 · Shift + Enter 换行
                    </span>
                  )}
                </div>

                <button
                  className={`${focusRing} grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-[#1f1f1f] p-0 text-white shadow-[0_4px_10px_rgba(31,31,31,0.18)] transition-colors hover:not-disabled:bg-[#f05a2a] disabled:cursor-not-allowed disabled:bg-[#d8d6d0] disabled:text-[#8f8c85] disabled:shadow-none`}
                  type={isBusy ? 'button' : 'submit'}
                  disabled={!question.trim() && !isBusy}
                  aria-label={isBusy ? '停止生成' : '发送消息'}
                  onClick={isBusy ? () => cancelSubmit() : undefined}
                >
                  {isBusy ? (
                    <StopIcon size={20} play="once" strokeWidth={2} />
                  ) : (
                    <SendIcon size={20} strokeWidth={2} />
                  )}
                </button>
              </div>
            </form>
          </div>

          {status === 'error' ? (
            <div
              className="mx-auto mt-2 flex max-w-[840px] flex-wrap items-center justify-center gap-x-2 gap-y-1 px-3 text-xs text-[#9a442d]"
              role="alert"
            >
              <UnmetIcon size={15} play="once" />
              <span>暂时无法获取回答，请检查服务后重试。</span>
              <button
                type="button"
                className={`${focusRing} cursor-pointer rounded-md border-0 bg-transparent px-1 font-semibold text-[#d4491f] underline underline-offset-2 transition-colors hover:text-[#a93412]`}
                onClick={retryLast}
              >
                重试
              </button>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}

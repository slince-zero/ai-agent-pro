import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import {
  IconArrowUp,
  IconCircleCheck,
  IconHistory,
  IconLoader2,
  IconPaperclip,
  IconPlus,
  IconScale,
  IconSearch,
  IconSparkles,
  IconUserCircle,
} from '@tabler/icons-react'
import axios from 'axios'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ModelResult, TokenUsage } from '@ai-agent-pro/shared/type.js'

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
  usage?: TokenUsage
}

type UIStatus = 'idle' | 'loading' | 'success' | 'error'

const initialMessages: ChatMessage[] = [
  {
    role: 'system',
    content: '你是一个负责检索问题搜索回答的 AI 助手',
  },
]

const examplePrompts = [
  { label: '找一篇 TypeScript 入门教程', icon: IconSearch },
  { label: '比较三个 Agent 方案', icon: IconScale },
  { label: '介绍下自己', icon: IconCircleCheck },
]

const focusRing =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-[#f05a2a]/30 focus-visible:outline-offset-[3px]'

const markdownPlugins = [remarkGfm]

function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return

  event.preventDefault()
  event.currentTarget.form?.requestSubmit()
}

export function App() {
  const fileInputId = useId()
  const messageEndRef = useRef<HTMLDivElement>(null)
  const [question, setQuestion] = useState('')
  const [attachment, setAttachment] = useState('')
  const [status, setStatus] = useState<UIStatus>('idle')
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)

  const conversation = messages.filter((message) => message.role !== 'system')
  const hasConversation = conversation.length > 0

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, status])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion || status === 'loading') return

    const nextMessages: ChatMessage[] = [
      ...messages,
      {
        role: 'user',
        content: trimmedQuestion,
      },
    ]

    setStatus('loading')
    setMessages(nextMessages)
    setQuestion('')

    try {
      const response = await axios.post<ModelResult>('/api/questions', {
        messages: nextMessages,
      })

      setMessages((previousMessages) => [
        ...previousMessages,
        { role: 'assistant', content: response.data.message, usage: response.data.usage },
      ])
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  function startNewConversation() {
    setMessages(initialMessages)
    setQuestion('')
    setAttachment('')
    setStatus('idle')
  }

  return (
    <div className="flex h-svh min-w-[320px] flex-col overflow-hidden bg-[#faf9f5] bg-[url('/assets/grid-paper.png')] bg-[length:1440px_auto] bg-[position:center_top] font-sans text-[#1f1f1f] antialiased">
      <header className="relative z-30 flex h-16 shrink-0 items-center justify-between border-b border-[#deddd7] bg-[#faf9f5]/95 px-6 backdrop-blur-sm max-[640px]:px-4">
        <a
          className={`${focusRing} text-[25px] font-extrabold tracking-[-1px] text-[#1f1f1f] no-underline`}
          href="#main-content"
          aria-label="Context 首页"
        >
          Context
        </a>

        <nav className="flex items-center gap-1.5" aria-label="会话操作">
          <button
            type="button"
            className={`${focusRing} inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border-0 bg-transparent px-3 text-sm font-semibold text-[#34332f] transition-colors hover:bg-[#f0ede6] hover:text-[#f05a2a]`}
            onClick={startNewConversation}
            aria-label="新对话"
          >
            <IconPlus className="size-[19px] stroke-[1.8]" aria-hidden="true" />
            <span className="max-[520px]:hidden">新对话</span>
          </button>
          <button
            type="button"
            className={`${focusRing} inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border-0 bg-transparent px-3 text-sm font-semibold text-[#34332f] transition-colors hover:bg-[#f0ede6] hover:text-[#f05a2a]`}
            title="历史记录（占位）"
            aria-label="历史记录（占位）"
          >
            <IconHistory className="size-[19px] stroke-[1.8]" aria-hidden="true" />
            <span className="max-[640px]:hidden">历史记录</span>
          </button>
          <button
            type="button"
            className={`${focusRing} grid size-10 cursor-pointer place-items-center rounded-xl border-0 bg-transparent p-0 text-[#34332f] transition-colors hover:bg-[#f0ede6] hover:text-[#f05a2a]`}
            aria-label="账户（占位）"
          >
            <IconUserCircle className="size-6 stroke-[1.7]" aria-hidden="true" />
          </button>
        </nav>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col" id="main-content">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {hasConversation ? (
            <section
              className="mx-auto flex w-[calc(100%_-_40px)] max-w-[840px] flex-col gap-8 py-9 max-[640px]:w-[calc(100%_-_28px)] max-[640px]:gap-7 max-[640px]:py-6"
              aria-label="对话内容"
              aria-live="polite"
            >
              {conversation.map((message, index) =>
                message.role === 'user' ? (
                  <article className="flex justify-end" key={`${message.role}-${index}`}>
                    <div className="max-w-[78%] rounded-[22px_22px_7px_22px] bg-[#eeeae2] px-5 py-3.5 text-[16px] leading-7 text-[#292824] max-[640px]:max-w-[88%] max-[640px]:px-4 max-[640px]:py-3">
                      {message.content}
                    </div>
                  </article>
                ) : (
                  <article
                    className="grid grid-cols-[36px_minmax(0,1fr)] items-start gap-4 max-[640px]:grid-cols-[32px_minmax(0,1fr)] max-[640px]:gap-3"
                    key={`${message.role}-${index}`}
                  >
                    <div className="grid size-9 place-items-center rounded-xl border border-[#f05a2a]/25 bg-[#fff7f2] text-[#e34f22] max-[640px]:size-8">
                      <IconSparkles className="size-[19px] stroke-[1.8]" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 pt-1">
                      <div className="text-[16px] leading-7 text-[#292824] [&_a]:text-[#d94b20] [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded-md [&_code]:bg-[#eeeae2] [&_code]:px-1.5 [&_code]:py-0.5 [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_li]:my-1 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-4 [&_p:last-child]:mb-0 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-[#292824] [&_pre]:p-4 [&_pre]:text-[#faf9f5] [&_strong]:font-bold [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6">
                        <Markdown remarkPlugins={markdownPlugins}>{message.content}</Markdown>
                      </div>
                      {message.usage ? (
                        <p className="mt-3 mb-0 text-xs leading-5 text-[#8a8881]">
                          输入 {message.usage.inputTokens} · 输出 {message.usage.outputTokens} · 共{' '}
                          {message.usage.totalTokens} tokens
                        </p>
                      ) : null}
                    </div>
                  </article>
                ),
              )}

              {status === 'loading' ? (
                <div className="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-4 text-sm text-[#77746d] max-[640px]:grid-cols-[32px_minmax(0,1fr)] max-[640px]:gap-3">
                  <div className="grid size-9 place-items-center rounded-xl border border-[#f05a2a]/20 bg-[#fff7f2] text-[#e34f22] max-[640px]:size-8">
                    <IconLoader2
                      className="size-[19px] animate-spin stroke-[1.8]"
                      aria-hidden="true"
                    />
                  </div>
                  <span>正在整理答案…</span>
                </div>
              ) : null}
              <div ref={messageEndRef} />
            </section>
          ) : (
            <section className="relative mx-auto flex min-h-full w-full max-w-[980px] flex-col items-center justify-center overflow-hidden px-6 py-14 text-center max-[640px]:justify-start max-[640px]:px-5 max-[640px]:pt-[16vh]">
              <img
                className="pointer-events-none absolute top-[62.5%] left-1/2 z-0 w-[min(1120px,118vw)] max-w-none -translate-x-1/2 -translate-y-[46%] select-none opacity-70 max-[640px]:top-[43%] max-[640px]:w-[170vw] max-[640px]:opacity-50"
                src="/assets/orange-connectors.png"
                alt=""
                aria-hidden="true"
              />
              <div className="relative z-10">
                <div className="mx-auto mb-5 grid size-11 place-items-center rounded-2xl border border-[#f05a2a]/25 bg-[#fff7f2] text-[#e34f22] shadow-[0_10px_28px_rgba(77,58,47,0.08)]">
                  <IconSparkles className="size-6 stroke-[1.8]" aria-hidden="true" />
                </div>
                <h1 className="m-0 text-[clamp(42px,5vw,64px)] leading-[1.08] font-black tracking-[-3px] text-[#1f1f1f] max-[640px]:text-[clamp(36px,10.8vw,44px)] max-[640px]:tracking-[-1.8px]">
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
                    onClick={() => setQuestion(label)}
                  >
                    <PromptIcon className="size-[18px] stroke-[1.8]" aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <section className="relative z-20 shrink-0 border-t border-[#e3e1db] bg-[#faf9f5]/95 px-5 pt-3 pb-4 backdrop-blur-sm max-[640px]:px-3 max-[640px]:pb-3">
          <form
            className="mx-auto max-w-[840px] overflow-hidden rounded-[26px] border border-[#b9b8b3] bg-white/85 shadow-[0_12px_36px_rgba(58,50,43,0.1)] transition-[border-color,box-shadow] duration-150 focus-within:border-[#8f8e89] focus-within:shadow-[0_12px_38px_rgba(58,50,43,0.13),0_0_0_4px_rgba(240,90,42,0.07)]"
            onSubmit={handleSubmit}
          >
            <label className="sr-only" htmlFor="question">
              输入消息
            </label>
            <textarea
              className="block max-h-40 min-h-[58px] w-full resize-none border-0 bg-transparent px-5 pt-4 pb-2 text-[16px] leading-6 text-[#22211e] outline-none placeholder:text-[#96938c] max-[640px]:px-4"
              id="question"
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
                  <IconPaperclip className="size-5 stroke-[1.8]" aria-hidden="true" />
                  <span className="sr-only">附加文件</span>
                </label>
                {attachment ? (
                  <span className="max-w-[260px] truncate text-xs text-[#77746d] max-[640px]:max-w-[140px]">
                    {attachment}
                  </span>
                ) : (
                  <span className="text-xs text-[#8a8881] max-[520px]:hidden">
                    Enter 发送 · Shift + Enter 换行
                  </span>
                )}
              </div>

              <button
                className={`${focusRing} grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-[#1f1f1f] p-0 text-white shadow-[0_4px_10px_rgba(31,31,31,0.18)] transition-colors hover:not-disabled:bg-[#f05a2a] disabled:cursor-not-allowed disabled:bg-[#d8d6d0] disabled:text-[#8f8c85] disabled:shadow-none`}
                type="submit"
                disabled={!question.trim() || status === 'loading'}
                aria-label={status === 'loading' ? '正在发送' : '发送消息'}
              >
                {status === 'loading' ? (
                  <IconLoader2 className="size-5 animate-spin stroke-2" aria-hidden="true" />
                ) : (
                  <IconArrowUp className="size-5 stroke-2" aria-hidden="true" />
                )}
              </button>
            </div>
          </form>

          {status === 'error' ? (
            <p
              className="mx-auto mt-2 mb-0 max-w-[840px] px-3 text-center text-xs text-[#9a442d]"
              role="alert"
            >
              暂时无法获取回答，请检查服务后重试。
            </p>
          ) : null}
        </section>
      </main>
    </div>
  )
}

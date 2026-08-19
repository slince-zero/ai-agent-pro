import { useId, useState } from 'react'
import {
  IconCircleCheck,
  IconHistory,
  IconPaperclip,
  IconScale,
  IconSearch,
  IconShieldCheck,
  IconStar,
  IconUserCircle,
} from '@tabler/icons-react'
import axios from 'axios'
import { ModelResult, TokenUsage } from '../../shared/type'

const examplePrompts = [
  { label: '找一篇 TypeScript 入门教程', icon: IconSearch },
  { label: '比较三个 Agent 方案', icon: IconScale },
  { label: '介绍下自己', icon: IconCircleCheck },
]

const focusRing =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-[#f05a2a]/30 focus-visible:outline-offset-[3px]'

export function App() {
  const fileInputId = useId()
  const [question, setQuestion] = useState('')
  const [attachment, setAttachment] = useState('')
  const [status, setStatus] = useState('idle')
  const [reply, setReply] = useState('')
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>()

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion || status === 'loading') return

    setStatus('loading')
    setReply('')

    try {
      const response = await axios.post<ModelResult>('/api/questions', {
        question: trimmedQuestion,
      })

      setReply(response.data.message)
      setTokenUsage(response.data.usage)
      setStatus('success')
    } catch {
      setReply('问题已经保留在页面中；服务占位接口暂时不可用。')
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen min-w-[320px] overflow-x-hidden bg-[#faf9f5] bg-[url('/assets/grid-paper.png')] bg-[length:1440px_auto] bg-[position:center_top] font-sans text-[#1f1f1f] antialiased">
      <header className="mx-auto flex h-[88px] w-[calc(100%_-_88px)] max-w-[1352px] items-center justify-between border-b border-[#deddd7] max-[760px]:h-[72px] max-[760px]:w-[calc(100%_-_36px)]">
        <a
          className={`${focusRing} text-[30px] font-extrabold tracking-[-1.2px] text-[#1f1f1f] no-underline max-[760px]:text-[25px]`}
          href="#main-content"
          aria-label="Context 首页"
        >
          Context
        </a>
        <nav className="flex items-center gap-[22px] max-[760px]:gap-2" aria-label="页面功能占位">
          <button
            type="button"
            className={`${focusRing} flex cursor-pointer items-center gap-[7px] border-0 bg-transparent px-0.5 py-2.5 font-semibold text-[#1f1f1f] hover:text-[#f05a2a]`}
            title="历史记录（占位）"
          >
            <IconHistory className="size-5 stroke-[1.8]" aria-hidden="true" />
            <span className="max-[760px]:hidden">历史记录</span>
          </button>
          <button
            type="button"
            className={`${focusRing} flex cursor-pointer items-center gap-[7px] border-0 bg-transparent px-0.5 py-2.5 font-semibold text-[#1f1f1f] hover:text-[#f05a2a]`}
            title="收藏（占位）"
          >
            <IconStar className="size-5 stroke-[1.8]" aria-hidden="true" />
            <span className="max-[760px]:hidden">收藏</span>
          </button>
          <button
            type="button"
            className={`${focusRing} grid size-10 cursor-pointer place-items-center border-0 bg-transparent p-0 text-[#1f1f1f] hover:text-[#f05a2a]`}
            aria-label="账户（占位）"
          >
            <IconUserCircle className="size-[29px] stroke-[1.6]" aria-hidden="true" />
          </button>
        </nav>
      </header>

      <main
        className="relative mx-auto w-[calc(100%_-_48px)] max-w-[1040px] pt-[188px] pb-[72px] max-[760px]:w-[calc(100%_-_32px)] max-[760px]:max-w-[1088px] max-[760px]:pt-[98px]"
        id="main-content"
      >
        <img
          className="pointer-events-none absolute top-[-80px] left-1/2 z-0 w-[min(1440px,132vw)] max-w-none -translate-x-1/2 select-none max-[760px]:top-3 max-[760px]:w-[168vw] max-[760px]:opacity-70"
          src="/assets/orange-connectors.png"
          alt=""
          aria-hidden="true"
        />
        <section className="relative z-10 text-center" aria-labelledby="hero-heading">
          <h1
            className="m-0 text-[clamp(54px,6vw,80px)] leading-[1.08] font-black tracking-[-4px] text-[#1f1f1f] max-[760px]:text-[clamp(48px,14vw,64px)] max-[760px]:tracking-[-2.6px]"
            id="hero-heading"
          >
            你想找什么？
          </h1>
          <p className="mx-auto mt-[42px] mb-0 text-[22px] leading-[1.55] text-[#44433f] max-[760px]:mt-6 max-[760px]:max-w-md max-[760px]:text-[17px]">
            描述目标、必须满足的条件和偏好，我会用来源帮你验证。
          </p>
        </section>

        <form
          className="relative z-10 mt-[50px] min-h-[254px] overflow-hidden rounded-2xl border border-[#b9b8b3] bg-white/40 transition-[border-color,box-shadow] duration-150 focus-within:border-[#8f8e89] focus-within:shadow-[0_0_0_4px_rgba(240,90,42,0.08)] max-[760px]:mt-[42px]"
          onSubmit={handleSubmit}
        >
          <label className="sr-only" htmlFor="question">
            输入检索问题
          </label>
          <textarea
            className="block h-[168px] resize-none min-h-[168px] w-full border-0 bg-transparent px-[30px] pt-[30px] pb-3 text-[18px] leading-[1.65] text-[#1f1f1f] outline-none placeholder:text-[#9a9994] max-[760px]:min-h-[170px] max-[760px]:px-5 max-[760px]:pt-[22px] max-[760px]:pb-2.5 max-[760px]:text-base"
            id="question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="例如：帮我找适合初学者的 Agent context engineering 教程…"
            rows={5}
          />
          <div className="flex items-center justify-between gap-4 px-5 pt-2.5 pb-5 max-[760px]:items-stretch max-[760px]:px-3.5">
            <div>
              <input
                id={fileInputId}
                className="peer sr-only"
                type="file"
                onChange={(event) => setAttachment(event.target.files?.[0]?.name ?? '')}
              />
              <label
                className="inline-flex min-h-[52px] max-w-[360px] cursor-pointer items-center justify-center gap-[9px] rounded-xl border border-[#c9c8c3] bg-white px-[18px] font-bold text-[#4d4c48] peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-[#f05a2a]/30 peer-focus-visible:outline-offset-[3px] max-[760px]:min-w-0 max-[760px]:px-3.5"
                htmlFor={fileInputId}
              >
                <IconPaperclip className="size-[21px] shrink-0 stroke-[1.8]" aria-hidden="true" />
                <span className="overflow-hidden text-ellipsis whitespace-nowrap max-[760px]:max-w-[100px]">
                  {attachment || '附加文件'}
                </span>
              </label>
            </div>
            <button
              className={`${focusRing} inline-flex min-h-[52px] min-w-[164px] cursor-pointer items-center justify-center gap-[9px] rounded-xl border border-[#131313] bg-[#1f1f1f] px-[22px] font-bold text-white shadow-[0_5px_12px_rgba(31,31,31,0.14)] hover:not-disabled:bg-black disabled:cursor-not-allowed max-[760px]:min-w-0 max-[760px]:px-3.5`}
              type="submit"
              disabled={!question.trim() || status === 'loading'}
            >
              <IconSearch className="size-[21px] shrink-0 stroke-[1.8]" aria-hidden="true" />
              <span>{status === 'loading' ? '正在提交' : '开始检索'}</span>
            </button>
          </div>
        </form>

        <div
          className="relative z-10 mt-[60px] flex justify-center max-[760px]:mt-[34px] max-[760px]:flex-col max-[760px]:items-start max-[760px]:gap-[18px] max-[760px]:px-1"
          aria-label="示例问题"
        >
          {examplePrompts.map(({ label, icon: PromptIcon }) => (
            <button
              className={`${focusRing} inline-flex cursor-pointer items-center gap-2.5 border-0 border-r border-[#deddd7] bg-transparent px-[34px] py-0.5 text-[17px] text-[#f05a2a] last:border-r-0 hover:text-[#bc3e17] max-[760px]:border-r-0 max-[760px]:p-0 max-[760px]:text-base`}
              key={label}
              type="button"
              onClick={() => setQuestion(label)}
            >
              <PromptIcon className="size-[21px] stroke-[1.8]" aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {reply ? (
          <section
            className={`relative z-10 mx-auto mt-11 flex max-w-[760px] gap-4 border-t border-[#deddd7] px-6 py-[22px] ${status === 'error' ? 'text-[#8b4d39]' : 'text-[#477b55]'}`}
            aria-live="polite"
          >
            <IconShieldCheck className="size-7 shrink-0 stroke-[1.7]" aria-hidden="true" />
            <div>
              <h2 className="m-0 text-lg font-bold text-[#1f1f1f]">问题已收到</h2>
              <p className="mt-1.5 mb-0 leading-[1.55]">{reply}</p>
              <span>inputTokens:{tokenUsage?.inputTokens}</span>
              <span>outputTokens:{tokenUsage?.outputTokens}</span>
              <span>totalTokens:{tokenUsage?.totalTokens}</span>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import {
  ConfirmedIcon,
  ContextAvatar,
  ContextLogo,
  SourceIcon,
  ThinkingIcon,
  TokensIcon,
  UnknownIcon,
  UnmetIcon,
} from '../icons'
import { Reveal } from './Reveal'
import { Eyebrow, SectionHeading, iconChip, sectionShell } from './ui'

const question =
  '帮我找适合初学者的 Agent context engineering 教程，要有完整示例，最好是 TypeScript'

const answer =
  '找到 3 篇满足硬条件的教程。下面这篇同时命中了「面向初学者」和「有完整示例」，语言偏好也一致；它的更新时间无法从页面确认，所以没有参与排序。'

/** 逐字输出的节奏：约 76 字/秒，整段 ≈ 1.9 秒吐完 */
const CHARS_PER_SECOND = 76

/**
 * 把整段文本按时间逐字吐出来，模拟真实的流式响应。
 *
 * 只有滚动进入视口后才开始，离开视口不重来；用 rAF 而不是 setInterval，
 * 标签页切到后台时浏览器会自动降频，不会空转。
 */
function useStreamedText(text: string) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(0)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const host = hostRef.current

    if (!host || typeof IntersectionObserver === 'undefined') {
      setStarted(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return

        setStarted(true)
        observer.disconnect()
      },
      { threshold: 0.35 },
    )

    observer.observe(host)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!started) return

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    if (reduced) {
      setVisibleCount(text.length)
      return
    }

    let frame = 0
    let start = 0

    /**
     * 进度按"已过去多少时间"算，而不是"跑了多少帧"。
     * 后台标签页或省电模式下 rAF 可能被压到 1fps，
     * 按帧累加会让这段演示慢到几十秒；按时间算则会直接跳到该有的位置。
     */
    function tick(now: number) {
      if (!start) start = now

      const count = Math.min(Math.round(((now - start) / 1000) * CHARS_PER_SECOND), text.length)

      setVisibleCount(count)

      // 吐完就不再申请下一帧，避免一个永远空转的动画循环
      if (count < text.length) {
        frame = requestAnimationFrame(tick)
      }
    }

    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [started, text])

  return {
    hostRef,
    text: text.slice(0, visibleCount),
    streaming: started && visibleCount < text.length,
    finished: visibleCount >= text.length,
  }
}

const conditions = [
  { Icon: ConfirmedIcon, label: '面向初学者', detail: '正文开头说明面向零基础读者', tone: 'ok' },
  { Icon: ConfirmedIcon, label: '有完整示例', detail: '含可运行的完整代码仓库链接', tone: 'ok' },
  { Icon: UnmetIcon, label: '不只讲框架用法', detail: '第 4 节大量篇幅在讲框架 API', tone: 'bad' },
  { Icon: UnknownIcon, label: '最近两年更新', detail: '页面没有可信的发布时间', tone: 'unknown' },
] as const

const toneClass = {
  ok: 'text-[#3f7d4f]',
  bad: 'text-[#a5452a]',
  unknown: 'text-[#8a8881]',
} as const

export function Demo() {
  const { hostRef, text, streaming, finished } = useStreamedText(answer)

  return (
    <section className="landing-defer border-y border-[#e6e4dd] bg-[#f4f1ea]/70 py-[104px] max-[640px]:py-16">
      <div className={sectionShell}>
        <SectionHeading
          eyebrow={<Eyebrow icon={ThinkingIcon}>真实界面</Eyebrow>}
          title="回答里带着它的依据"
          description="结果不是一段无从核对的总结：每个条件都写清判断、原因和来源，不确定的部分照实标出来。"
        />

        <Reveal className="mt-14">
          <div
            className="mx-auto max-w-[860px] overflow-hidden rounded-[26px] border border-[#deddd7] bg-[#faf9f5] shadow-[0_24px_60px_rgba(58,50,43,0.12)]"
            ref={hostRef}
          >
            <div className="flex h-14 items-center gap-3 border-b border-[#e3e1db] bg-white/70 px-5">
              <ContextLogo size={22} wordmark={false} />
              <span className="text-xs text-[#8a8881]">context · 检索会话</span>
            </div>

            <div className="flex flex-col gap-7 px-7 py-8 max-[640px]:px-5 max-[640px]:py-6">
              <div className="flex justify-end">
                <p className="m-0 max-w-[78%] rounded-[22px_22px_7px_22px] bg-[#eeeae2] px-5 py-3.5 text-[15px] leading-7 text-[#292824]">
                  {question}
                </p>
              </div>

              <div className="grid grid-cols-[36px_minmax(0,1fr)] items-start gap-4 max-[640px]:grid-cols-[32px_minmax(0,1fr)] max-[640px]:gap-3">
                <span className={`${iconChip} size-9 max-[640px]:size-8`}>
                  <ContextAvatar size={20} />
                </span>
                <div className="min-w-0 pt-1">
                  <div
                    className={
                      streaming
                        ? 'stream-caret text-[15px] leading-7 text-[#292824]'
                        : 'text-[15px] leading-7 text-[#292824]'
                    }
                  >
                    <p className="m-0 min-h-14">{text}</p>
                  </div>

                  <div
                    className="mt-5 rounded-2xl border border-[#e3e1db] bg-white/80 p-5 transition-opacity duration-500 max-[640px]:p-4"
                    style={{ opacity: finished ? 1 : 0 }}
                    aria-hidden={finished ? undefined : true}
                  >
                    <p className="m-0 text-[15px] font-semibold text-[#1f1f1f]">
                      Context Engineering for Agents：从零开始的实践指南
                    </p>
                    <ul className="mt-4 flex list-none flex-col gap-2.5 p-0">
                      {conditions.map(({ Icon, label, detail, tone }) => (
                        <li className="flex items-start gap-2.5 text-[13px] leading-6" key={label}>
                          <span className={`mt-0.5 shrink-0 ${toneClass[tone]}`}>
                            <Icon size={16} play="none" />
                          </span>
                          <span className="min-w-0">
                            <span className="font-semibold text-[#34332f]">{label}</span>
                            <span className="text-[#77746d]"> · {detail}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-4 mb-0 flex items-center gap-1.5 text-xs text-[#8a8881]">
                      <SourceIcon size={14} play="none" />
                      判断来自该页面正文第 1、3 节
                    </p>
                  </div>

                  <p
                    className="mt-4 mb-0 flex items-center gap-1.5 text-xs leading-5 text-[#8a8881] transition-opacity duration-500"
                    style={{ opacity: finished ? 1 : 0 }}
                  >
                    <TokensIcon size={15} play="none" />
                    输入 1 284 · 输出 316 · 共 1 600 tokens
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
